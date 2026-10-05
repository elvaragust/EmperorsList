import { db } from './db';
import type { Roster } from '@/engine/types';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

/** No limit on the number of lists. */
export async function createRoster(partial: Pick<Roster, 'name' | 'factionName' | 'catalogueId'> & Partial<Roster>): Promise<string> {
  const now = Date.now();
  const roster: Roster = {
    id: uid(),
    gameSystemId: '',
    battleSize: 'strikeForce',
    pointsLimit: 2000,
    detachmentIds: [],
    config: [],
    units: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
  await db.rosters.put(roster);
  return roster.id;
}

export async function duplicateRoster(id: string): Promise<string | undefined> {
  const r = await db.rosters.get(id);
  if (!r) return undefined;
  const now = Date.now();
  const copy: Roster = { ...structuredClone(r), id: uid(), name: `${r.name} (copy)`, createdAt: now, updatedAt: now };
  await db.rosters.put(copy);
  return copy.id;
}

export async function renameRoster(id: string, name: string) {
  const r = await db.rosters.get(id);
  if (r) await db.rosters.put({ ...r, name, updatedAt: Date.now() });
}

export async function deleteRoster(id: string) {
  await db.rosters.delete(id);
}

/** A whole-library backup: list structure only (ids and counts), no rules text. */
export async function exportAll(): Promise<string> {
  const rosters = await db.rosters.toArray();
  return JSON.stringify({ app: 'emperorslist', version: 1, exportedAt: new Date().toISOString(), rosters }, null, 2);
}
