import type { Roster } from '@/engine/types';
import type { CollectionItem, Layout, Pin, SavedGame } from './db';

/** Newest backup format this app can read. */
export const BACKUP_VERSION = 3;

/** What a backup file holds, after checking. Wahapedia rows (`imported`) in older backups are ignored. */
export interface BackupData {
  version: number;
  exportedAt?: string;
  rosters: Roster[];
  games: SavedGame[];
  collection: CollectionItem[];
  layouts: Layout[];
  pins: Pin[];
  /** Entries that were not readable and are left out. */
  skipped: number;
}

export type BackupKind = 'rosters' | 'games' | 'collection' | 'layouts' | 'pins';
export const BACKUP_KINDS: BackupKind[] = ['rosters', 'games', 'collection', 'layouts', 'pins'];

const KEY: Record<BackupKind, string> = { rosters: 'id', games: 'id', collection: 'entryId', layouts: 'id', pins: 'id' };

export class BackupError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Read and check a backup file. Throws a BackupError with a message for the player. */
export function parseBackup(text: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("This file couldn't be read. Pick the .json file the app saved as a backup.");
  }
  if (!isObj(raw) || raw.app !== 'emperorslist') throw new BackupError('This file is not an EmperorsList backup.');
  if (raw.kind !== undefined && raw.kind !== 'backup') throw new BackupError('This is an EmperorsList file, but not a backup.');
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > BACKUP_VERSION) throw new BackupError('This backup was made by a newer version of the app. Reload the app to update it, then try again.');
  let skipped = 0;
  const list = <T,>(kind: BackupKind): T[] => {
    const v = raw[kind];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new BackupError('This backup file is damaged and can’t be restored.');
    return v.filter((item) => {
      const ok = isObj(item) && typeof item[KEY[kind]] === 'string' && item[KEY[kind]] !== '';
      if (!ok) skipped++;
      return ok;
    }) as T[];
  };
  const rosters = list<Roster>('rosters').map((r) => ({ ...r, config: r.config ?? [], detachmentIds: r.detachmentIds ?? [], units: r.units ?? [] }));
  const games = list<SavedGame>('games').filter((g) => !g.practice);
  const data: BackupData = {
    version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined,
    rosters,
    games,
    collection: list<CollectionItem>('collection'),
    layouts: list<Layout>('layouts'),
    pins: list<Pin>('pins'),
    skipped,
  };
  if (BACKUP_KINDS.every((k) => data[k].length === 0)) throw new BackupError('This backup is empty — there is nothing to restore.');
  return data;
}

/** Last change to a list or game (undefined when the item has no time to compare). */
export function changedAt(kind: BackupKind, item: unknown): number | undefined {
  const o = item as Partial<Roster & SavedGame>;
  if (kind === 'rosters') return o.updatedAt ?? o.createdAt;
  if (kind === 'games') return o.lastActiveAt ?? o.finishedAt ?? o.startedAt;
  return undefined;
}

/**
 * How one backup item compares with this device:
 * new (not here), newer / older (than this device's copy), same (no difference),
 * differs (both changed and there's no time to compare — pins, layouts, collection).
 */
export type Compare = 'new' | 'newer' | 'older' | 'same' | 'differs';

export type Counts = Record<Compare, number>;
const zero = (): Counts => ({ new: 0, newer: 0, older: 0, same: 0, differs: 0 });

const stable = (v: unknown) => JSON.stringify(v);

export function compareItem(kind: BackupKind, backup: unknown, here: unknown): Compare {
  if (here === undefined) return 'new';
  const a = changedAt(kind, backup);
  const b = changedAt(kind, here);
  if (a !== undefined && b !== undefined && a !== b) return a > b ? 'newer' : 'older';
  if (stable(backup) === stable(here)) return 'same';
  return 'differs';
}

/** keep-newer: add new items and take the backup's copy only where it is newer. replace: the backup's copy of everything in it. */
export type RestoreMode = 'newer' | 'replace';

export interface RestorePlan {
  data: BackupData;
  counts: Record<BackupKind, Counts>;
  /** Per item id, how it compares. */
  compare: Record<BackupKind, Map<string, Compare>>;
}

export type DeviceItems = Record<BackupKind, Map<string, unknown>>;

/** Compare a backup with what is on this device. */
export function planRestore(data: BackupData, here: DeviceItems): RestorePlan {
  const counts = {} as RestorePlan['counts'];
  const compare = {} as RestorePlan['compare'];
  for (const kind of BACKUP_KINDS) {
    counts[kind] = zero();
    compare[kind] = new Map();
    for (const item of data[kind] as unknown as Record<string, string>[]) {
      const id = item[KEY[kind]]!;
      const c = compareItem(kind, item, here[kind].get(id));
      counts[kind][c]++;
      compare[kind].set(id, c);
    }
  }
  return { data, counts, compare };
}

/** Which backup items get written for a restore mode. */
export function itemsToWrite<K extends BackupKind>(plan: RestorePlan, kind: K, mode: RestoreMode): BackupData[K] {
  const take = (c: Compare) => (mode === 'replace' ? c !== 'same' : c === 'new' || c === 'newer');
  return (plan.data[kind] as unknown as Record<string, string>[]).filter((item) => take(plan.compare[kind].get(item[KEY[kind]]!)!)) as unknown as BackupData[K];
}

export interface RestoreSummary {
  /** Added (not on this device before). */
  added: Record<BackupKind, number>;
  /** This device's copy replaced by the backup's. */
  updated: Record<BackupKind, number>;
  /** This device's copy kept (it was newer, or the same). */
  kept: Record<BackupKind, number>;
  skipped: number;
}

export function summarize(plan: RestorePlan, mode: RestoreMode): RestoreSummary {
  const added = {} as RestoreSummary['added'];
  const updated = {} as RestoreSummary['updated'];
  const kept = {} as RestoreSummary['kept'];
  for (const kind of BACKUP_KINDS) {
    const c = plan.counts[kind];
    added[kind] = c.new;
    updated[kind] = mode === 'replace' ? c.newer + c.older + c.differs : c.newer;
    kept[kind] = mode === 'replace' ? c.same : c.same + c.older + c.differs;
  }
  return { added, updated, kept, skipped: plan.data.skipped };
}

const NOUNS: Record<BackupKind, [string, string]> = {
  rosters: ['list', 'lists'],
  games: ['game', 'games'],
  collection: ['collection entry', 'collection entries'],
  layouts: ['layout', 'layouts'],
  pins: ['pin', 'pins'],
};
export const countOf = (kind: BackupKind, n: number) => `${n} ${NOUNS[kind][n === 1 ? 0 : 1]}`;

/** "2 lists, 1 game" for the kinds with a count (empty string when none). */
export function countsText(by: Record<BackupKind, number>): string {
  return BACKUP_KINDS.filter((k) => by[k] > 0)
    .map((k) => countOf(k, by[k]))
    .join(', ');
}

/** One plain sentence or two for after a restore. */
export function summaryText(s: RestoreSummary): string {
  const parts: string[] = [];
  const added = countsText(s.added);
  const updated = countsText(s.updated);
  const kept = countsText(s.kept);
  if (added) parts.push(`Added ${added}.`);
  if (updated) parts.push(`Updated ${updated} from the backup.`);
  if (kept) parts.push(`Kept this device's copy of ${kept}.`);
  if (s.skipped) parts.push(`${s.skipped} damaged ${s.skipped === 1 ? 'entry was' : 'entries were'} left out.`);
  return parts.length ? parts.join(' ') : 'Nothing to restore.';
}
