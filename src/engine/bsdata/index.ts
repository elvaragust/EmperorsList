import type { RawCatalogue, RawEntry, RawFile, RawLink, RawProfile, RawRule } from './raw';

/**
 * A lookup over one game system plus any number of catalogues.
 * BSData spreads definitions across files (faction catalogue -> library
 * catalogue -> game system), and entries point at each other by id.
 * The index flattens all of that so the rest of the engine can resolve links
 * without knowing which file an entry came from.
 */
export interface DataIndex {
  entries: Map<string, RawEntry>;
  profiles: Map<string, RawProfile>;
  rules: Map<string, RawRule>;
  catalogues: Map<string, RawCatalogue>;
}

export function catalogueOf(file: RawFile): RawCatalogue {
  const c = file.catalogue ?? file.gameSystem;
  if (!c) throw new Error('Not a BSData catalogue or game system file');
  return c;
}

export function buildIndex(files: RawFile[]): DataIndex {
  const index: DataIndex = {
    entries: new Map(),
    profiles: new Map(),
    rules: new Map(),
    catalogues: new Map(),
  };

  const addEntry = (e: RawEntry) => {
    index.entries.set(e.id, e);
    e.profiles?.forEach((p) => index.profiles.set(p.id, p));
    e.rules?.forEach((r) => index.rules.set(r.id, r));
    e.selectionEntries?.forEach(addEntry);
    e.selectionEntryGroups?.forEach(addEntry);
  };

  for (const file of files) {
    const cat = catalogueOf(file);
    index.catalogues.set(cat.id, cat);
    cat.sharedSelectionEntries?.forEach(addEntry);
    cat.sharedSelectionEntryGroups?.forEach(addEntry);
    cat.sharedProfiles?.forEach((p) => index.profiles.set(p.id, p));
    cat.sharedRules?.forEach((r) => index.rules.set(r.id, r));
  }
  return index;
}

/** Follow an entryLink to the entry it points at, applying the link's name if hidden is not set. */
export function resolveLink(index: DataIndex, link: RawLink): RawEntry | undefined {
  return index.entries.get(link.targetId);
}

/** Children of an entry or group, with entryLinks resolved. Hidden children are skipped. */
export function childrenOf(index: DataIndex, entry: RawEntry): RawEntry[] {
  const out: RawEntry[] = [];
  entry.selectionEntries?.forEach((e) => !e.hidden && out.push(e));
  entry.selectionEntryGroups?.forEach((g) => !g.hidden && out.push(g));
  entry.entryLinks?.forEach((l) => {
    if (l.hidden) return;
    const target = resolveLink(index, l);
    if (target && !target.hidden) out.push(target);
  });
  return out;
}

/** Root "add unit" choices of a faction catalogue (its own links plus imported catalogues' roots). */
export function rootUnits(index: DataIndex, catalogueId: string, seen = new Set<string>()): RawEntry[] {
  if (seen.has(catalogueId)) return [];
  seen.add(catalogueId);
  const cat = index.catalogues.get(catalogueId);
  if (!cat) return [];
  const units = new Map<string, RawEntry>();
  cat.entryLinks?.forEach((l) => {
    const e = resolveLink(index, l);
    if (e && e.type === 'unit' && !l.hidden) units.set(e.id, e);
  });
  cat.sharedSelectionEntries?.forEach((e) => {
    if (e.type === 'unit' && !e.hidden) units.set(e.id, e);
  });
  cat.catalogueLinks?.forEach((cl) => {
    rootUnits(index, cl.targetId, seen).forEach((u) => units.set(u.id, u));
  });
  return [...units.values()];
}
