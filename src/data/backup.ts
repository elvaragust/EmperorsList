import { db } from './db';
import { isIOSBrowser } from './platform';
import { BACKUP_KINDS, BACKUP_VERSION, itemsToWrite, parseBackup, planRestore, summarize, type BackupKind, type DeviceItems, type RestoreMode, type RestorePlan, type RestoreSummary } from './backupMerge';

/** Everything the user made (lists, games, collection, layouts, pins). No downloaded game data, and no Wahapedia rules (they load again by themselves). */
export async function exportBackup(): Promise<string> {
  const [rosters, games, collection, layouts, pins] = await Promise.all([db.rosters.toArray(), db.games.filter((g) => !g.practice).toArray(), db.collection.toArray(), db.layouts.toArray(), db.pins.toArray()]);
  return JSON.stringify({ app: 'emperorslist', kind: 'backup', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), rosters, games, collection, layouts, pins });
}

/** Read a backup file and compare it with this device, without changing anything. Throws a BackupError with a message for the player. */
export async function previewRestore(text: string): Promise<RestorePlan> {
  const data = parseBackup(text);
  const tables = { rosters: db.rosters, games: db.games, collection: db.collection, layouts: db.layouts, pins: db.pins } as const;
  const here = {} as DeviceItems;
  for (const kind of BACKUP_KINDS) {
    const table = tables[kind] as unknown as { bulkGet(keys: string[]): Promise<unknown[]> };
    const ids = (data[kind] as unknown as Record<string, string>[]).map((item) => item[kind === 'collection' ? 'entryId' : 'id']!);
    const found = await table.bulkGet(ids);
    here[kind] = new Map(ids.flatMap((id, i) => (found[i] === undefined ? [] : [[id, found[i]] as [string, unknown]])));
  }
  return planRestore(data, here);
}

/**
 * Write a checked backup into this device. 'newer' adds what is missing and
 * takes the backup's copy only where it is newer; 'replace' takes the
 * backup's copy of everything in it. Nothing on this device is deleted.
 */
export async function applyRestore(plan: RestorePlan, mode: RestoreMode): Promise<RestoreSummary> {
  const pick = <K extends BackupKind>(kind: K) => itemsToWrite(plan, kind, mode);
  const games = pick('games');
  await db.transaction('rw', [db.rosters, db.games, db.collection, db.layouts, db.pins], async () => {
    await db.layouts.bulkPut(pick('layouts'));
    await db.pins.bulkPut(pick('pins'));
    await db.rosters.bulkPut(pick('rosters'));
    // Delete and add (not put) so the games keep their own "last played" time instead of getting today's.
    await db.games.bulkDelete(games.map((g) => g.id));
    await db.games.bulkAdd(games);
    await db.collection.bulkPut(pick('collection'));
  });
  return summarize(plan, mode);
}

/** Trigger a file download of some text. */
export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const LAST_BACKUP_KEY = 'emperorslist.lastBackup';
const SNOOZE_KEY = 'emperorslist.backupSnooze';
const read = (k: string) => {
  try {
    return Number(localStorage.getItem(k) ?? 0);
  } catch {
    return 0;
  }
};
const write = (k: string, v: number) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* ignore */
  }
};

/** When a backup was last saved from this phone (0 = never). */
export const lastBackupAt = () => read(LAST_BACKUP_KEY);

/**
 * Save a backup file somewhere outside the browser. On phones that can, the
 * share sheet opens so it can go straight to Google Drive, iCloud Files,
 * email…; elsewhere the file is downloaded. Returns how it was saved, or
 * undefined when the player cancelled.
 */
export async function saveBackupFile(): Promise<'shared' | 'downloaded' | undefined> {
  const text = await exportBackup();
  const name = `emperorslist-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = typeof File !== 'undefined' ? new File([text], name, { type: 'application/json' }) : undefined;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'EmperorsList backup' });
      write(LAST_BACKUP_KEY, Date.now());
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return undefined;
    }
  }
  downloadText(name, text);
  write(LAST_BACKUP_KEY, Date.now());
  return 'downloaded';
}

const DAY = 24 * 3600 * 1000;

/**
 * Remind about a backup when there's something to lose and none was saved for
 * two weeks (unless put off). In Safari on iPhone/iPad, where the site's data
 * is deleted after 7 days without a visit, every 5 days.
 */
export function backupDue(hasData: boolean): boolean {
  if (!hasData) return false;
  const now = Date.now();
  if (read(SNOOZE_KEY) > now) return false;
  return now - lastBackupAt() > (isIOSBrowser() ? 5 : 14) * DAY;
}
export const snoozeBackup = (days = isIOSBrowser() ? 2 : 7) => write(SNOOZE_KEY, Date.now() + days * DAY);
