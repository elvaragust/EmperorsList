import type { RosterEngine } from './rosterEngine';

/** List sections, in the official app's order. */
export const ROLES = ['Characters', 'Battleline', 'Dedicated Transports', 'Other datasheets', 'Allied units'] as const;
export type Role = (typeof ROLES)[number];

const cache = new WeakMap<RosterEngine, string | undefined>();
const ownCache = new WeakMap<RosterEngine, Set<string>>();

const catsOf = (engine: RosterEngine, node: { categoryIds: string[]; targetId: string }) => [...node.categoryIds, ...(engine.index.entries.get(node.targetId)?.categoryLinks ?? []).map((l) => l.targetId)];
const isFaction = (engine: RosterEngine, id: string) => /^faction:/i.test(engine.index.categories.get(id)?.name ?? '');

/** The army's keywords: the main one plus every faction keyword on the faction's own datasheets (Adeptus Astartes, Black Templars). */
function ownFactions(engine: RosterEngine): Set<string> {
  let s = ownCache.get(engine);
  if (s) return s;
  s = new Set<string>();
  const main = armyFaction(engine);
  if (main) s.add(main);
  for (const c of engine.unitChoices()) {
    if (engine.index.origin.get(c.root.node.targetId) !== engine.roster.catalogueId) continue;
    for (const id of catsOf(engine, c.root.node)) if (isFaction(engine, id)) s.add(id);
  }
  ownCache.set(engine, s);
  return s;
}

/**
 * The army's own faction keyword (e.g. "Faction: Adeptus Astartes" for Black
 * Templars): the one most datasheets it can take carry. Units
 * without it (Agents of the Imperium, Imperial Knights…) are allies.
 */
export function armyFaction(engine: RosterEngine): string | undefined {
  if (cache.has(engine)) return cache.get(engine);
  const counts = new Map<string, number>();
  // Counted over every datasheet the army can take: allies are always the few.
  for (const c of engine.unitChoices()) {
    const target = engine.index.entries.get(c.root.node.targetId);
    for (const id of new Set([...c.root.node.categoryIds, ...(target?.categoryLinks ?? []).map((l) => l.targetId)])) {
      if (!/^faction:/i.test(engine.index.categories.get(id)?.name ?? '')) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  // The broadest keyword the faction's units share (Adeptus Astartes rather than Black Templars).
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  cache.set(engine, best);
  return best;
}

export function roleOfCategory(name: string): Exclude<Role, 'Allied units'> {
  if (/character|epic hero/i.test(name)) return 'Characters';
  if (/battleline/i.test(name)) return 'Battleline';
  if (/dedicated transport/i.test(name)) return 'Dedicated Transports';
  return 'Other datasheets';
}

/** Allied = carries faction keywords, but not the army's (a datasheet with none at all is the army's own). */
function allied(engine: RosterEngine, ids: Iterable<string>): boolean {
  const own = ownFactions(engine);
  if (!own.size) return false;
  const factions = [...ids].filter((id) => isFaction(engine, id));
  return factions.length > 0 && !factions.some((f) => own.has(f));
}

/** Section of a unit choice (Add unit). */
export function choiceRole(engine: RosterEngine, node: { categoryIds: string[]; targetId: string }, primary?: string): Role {
  if (allied(engine, catsOf(engine, node))) return 'Allied units';
  return roleOfCategory(engine.index.categories.get(primary ?? '')?.name ?? '');
}

/** Section of a unit in the list. */
export function unitRole(engine: RosterEngine, unitId: string, primary?: string): Role {
  if (allied(engine, engine.categoriesOf(unitId))) return 'Allied units';
  return roleOfCategory(engine.index.categories.get(primary ?? engine.unitInst(unitId)?.node?.primaryCategory ?? '')?.name ?? '');
}
