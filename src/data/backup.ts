import { db } from './db';

/** Everything the user made (lists, games, collection, layouts, imported extra rules). No downloaded game data. */
export async function exportBackup(): Promise<string> {
  const [rosters, games, collection, imported, layouts, pins] = await Promise.all([db.rosters.toArray(), db.games.filter((g) => !g.practice).toArray(), db.collection.toArray(), db.imported.toArray(), db.layouts.toArray(), db.pins.toArray()]);
  return JSON.stringify({ app: 'emperorslist', kind: 'backup', version: 3, exportedAt: new Date().toISOString(), rosters, games, collection, imported, layouts, pins });
}

export interface RestoreResult {
  rosters: number;
  games: number;
  collection: number;
  imported: number;
}

/** Merge a backup into this device. Items with the same id are replaced by the backup's copy. */
export async function restoreBackup(text: string): Promise<RestoreResult> {
  const data = JSON.parse(text) as { app?: string; rosters?: unknown[]; games?: unknown[]; collection?: unknown[]; imported?: unknown[]; layouts?: unknown[]; pins?: unknown[] };
  if (data.app !== 'emperorslist') throw new Error('This file is not an EmperorsList backup.');
  const rosters = (data.rosters ?? []) as Parameters<typeof db.rosters.bulkPut>[0];
  const games = (data.games ?? []) as Parameters<typeof db.games.bulkPut>[0];
  const collection = (data.collection ?? []) as Parameters<typeof db.collection.bulkPut>[0];
  const imported = (data.imported ?? []) as Parameters<typeof db.imported.bulkPut>[0];
  const layouts = (data.layouts ?? []) as Parameters<typeof db.layouts.bulkPut>[0];
  const pins = (data.pins ?? []) as Parameters<typeof db.pins.bulkPut>[0];
  rosters.forEach((r) => {
    r.config ??= [];
    r.detachmentIds ??= [];
  });
  await db.transaction('rw', [db.rosters, db.games, db.collection, db.imported, db.layouts, db.pins], async () => {
    await db.layouts.bulkPut(layouts);
    await db.pins.bulkPut(pins);
    await db.rosters.bulkPut(rosters);
    await db.games.bulkPut(games);
    await db.collection.bulkPut(collection);
    await db.imported.bulkPut(imported);
  });
  return { rosters: rosters.length, games: games.length, collection: collection.length, imported: imported.length };
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

/** Remind about a backup when there's something to lose and none was saved for two weeks (unless put off). */
export function backupDue(hasData: boolean): boolean {
  if (!hasData) return false;
  const now = Date.now();
  if (read(SNOOZE_KEY) > now) return false;
  return now - lastBackupAt() > 14 * 24 * 3600 * 1000;
}
export const snoozeBackup = (days = 7) => write(SNOOZE_KEY, Date.now() + days * 24 * 3600 * 1000);
