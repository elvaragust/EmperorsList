import { db } from './db';

/** Everything the user made (lists, games, collection, imported extra rules). No downloaded game data. */
export async function exportBackup(): Promise<string> {
  const [rosters, games, collection, imported] = await Promise.all([db.rosters.toArray(), db.games.toArray(), db.collection.toArray(), db.imported.toArray()]);
  return JSON.stringify({ app: 'emperorslist', kind: 'backup', version: 2, exportedAt: new Date().toISOString(), rosters, games, collection, imported });
}

export interface RestoreResult {
  rosters: number;
  games: number;
  collection: number;
  imported: number;
}

/** Merge a backup into this device. Items with the same id are replaced by the backup's copy. */
export async function restoreBackup(text: string): Promise<RestoreResult> {
  const data = JSON.parse(text) as { app?: string; rosters?: unknown[]; games?: unknown[]; collection?: unknown[]; imported?: unknown[] };
  if (data.app !== 'emperorslist') throw new Error('This file is not an EmperorsList backup.');
  const rosters = (data.rosters ?? []) as Parameters<typeof db.rosters.bulkPut>[0];
  const games = (data.games ?? []) as Parameters<typeof db.games.bulkPut>[0];
  const collection = (data.collection ?? []) as Parameters<typeof db.collection.bulkPut>[0];
  const imported = (data.imported ?? []) as Parameters<typeof db.imported.bulkPut>[0];
  rosters.forEach((r) => {
    r.config ??= [];
    r.detachmentIds ??= [];
  });
  await db.transaction('rw', [db.rosters, db.games, db.collection, db.imported], async () => {
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
