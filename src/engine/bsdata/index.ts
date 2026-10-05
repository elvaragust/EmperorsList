import type { RawCatalogue, RawEntry, RawFile, RawForceEntry, RawLink, RawProfile, RawRule } from './raw';

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
  categories: Map<string, RawEntry>;
  costTypes: Map<string, string>;
  forceEntries: Map<string, RawForceEntry>;
  /** Which catalogue each shared entry/profile/rule came from (for "source" labels). */
  origin: Map<string, string>;
  gameSystem?: RawCatalogue;
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
    categories: new Map(),
    costTypes: new Map(),
    forceEntries: new Map(),
    origin: new Map(),
  };

  const addProfile = (p: RawProfile, cat: string) => {
    index.profiles.set(p.id, p);
    if (!index.origin.has(p.id)) index.origin.set(p.id, cat);
  };
  const addRule = (r: RawRule, cat: string) => {
    index.rules.set(r.id, r);
    if (!index.origin.has(r.id)) index.origin.set(r.id, cat);
  };
  const addEntry = (e: RawEntry | RawLink, cat: string, depth = 0) => {
    if (depth > 40) return;
    if (!('targetId' in e) || !e.targetId) index.entries.set(e.id, e as RawEntry);
    if (!index.origin.has(e.id)) index.origin.set(e.id, cat);
    e.profiles?.forEach((p) => addProfile(p, cat));
    e.rules?.forEach((r) => addRule(r, cat));
    e.selectionEntries?.forEach((c) => addEntry(c, cat, depth + 1));
    e.selectionEntryGroups?.forEach((c) => addEntry(c, cat, depth + 1));
    // Links may carry inline children of their own.
    e.entryLinks?.forEach((l) => {
      l.selectionEntries?.forEach((c) => addEntry(c, cat, depth + 1));
      l.selectionEntryGroups?.forEach((c) => addEntry(c, cat, depth + 1));
      l.profiles?.forEach((p) => addProfile(p, cat));
      l.rules?.forEach((r) => addRule(r, cat));
    });
  };
  const addForce = (f: RawForceEntry) => {
    index.forceEntries.set(f.id, f);
    f.forceEntries?.forEach(addForce);
  };

  for (const file of files) {
    const cat = catalogueOf(file);
    index.catalogues.set(cat.id, cat);
    if (file.gameSystem) index.gameSystem = cat;
    cat.sharedSelectionEntries?.forEach((e) => addEntry(e, cat.id));
    cat.sharedSelectionEntryGroups?.forEach((e) => addEntry(e, cat.id));
    cat.sharedInfoGroups?.forEach((e) => addEntry(e, cat.id));
    cat.sharedProfiles?.forEach((p) => addProfile(p, cat.id));
    cat.sharedRules?.forEach((r) => addRule(r, cat.id));
    cat.categoryEntries?.forEach((c) => {
      if (!index.categories.has(c.id) || c.rules?.length || c.infoLinks?.length) index.categories.set(c.id, c);
      c.rules?.forEach((r) => addRule(r, cat.id));
    });
    cat.costTypes?.forEach((c) => index.costTypes.set(c.id, c.name));
    cat.forceEntries?.forEach(addForce);
  }
  return index;
}

/** Follow an entryLink to the entry it points at. */
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

/** The catalogue plus every catalogue it imports, depth first, without repeats. */
export function catalogueChain(index: DataIndex, catalogueId: string, seen = new Set<string>()): RawCatalogue[] {
  if (seen.has(catalogueId)) return [];
  seen.add(catalogueId);
  const cat = index.catalogues.get(catalogueId);
  if (!cat) return [];
  return [cat, ...(cat.catalogueLinks ?? []).flatMap((l) => catalogueChain(index, l.targetId, seen))];
}

/** Root "add unit" choices of a faction catalogue (its own links plus imported catalogues' roots). */
export function rootUnits(index: DataIndex, catalogueId: string, seen = new Set<string>()): RawEntry[] {
  return rootLinks(index, catalogueId, seen)
    .filter((r) => r.entry.type === 'unit' || (r.entry.type === 'model' && isUnitRoot(index, r.link ?? r.entry)))
    .map((r) => r.entry);
}

const CONFIG_CATEGORY = '4ac9-fd30-1e3d-b249';

function isUnitRoot(index: DataIndex, e: RawEntry | RawLink): boolean {
  const target = 'targetId' in e && e.targetId ? index.entries.get(e.targetId) : (e as RawEntry);
  const cats = [...(e.categoryLinks ?? []), ...(target?.categoryLinks ?? [])];
  return !cats.some((c) => c.targetId === CONFIG_CATEGORY);
}

export interface RootChoice {
  /** The id a roster stores: the link id when the root is a link, else the entry id. */
  key: string;
  link?: RawLink;
  entry: RawEntry;
  catalogueId: string;
}

/** Every root entry (units, characters, configuration) reachable from a catalogue. */
export function rootLinks(index: DataIndex, catalogueId: string, seen = new Set<string>()): RootChoice[] {
  const out = new Map<string, RootChoice>();
  const targets = new Set<string>();
  const visit = (cat: RawCatalogue, importAll: boolean) => {
    cat.entryLinks?.forEach((l) => {
      const e = resolveLink(index, l);
      if (!e || l.hidden || targets.has(e.id)) return;
      targets.add(e.id);
      out.set(l.id, { key: l.id, link: l, entry: e, catalogueId: cat.id });
    });
    cat.selectionEntries?.forEach((e) => {
      if (e.hidden || targets.has(e.id)) return;
      targets.add(e.id);
      out.set(e.id, { key: e.id, entry: e, catalogueId: cat.id });
    });
    if (importAll) {
      // Older catalogues list roots as shared entries.
      cat.sharedSelectionEntries?.forEach((e) => {
        if (e.hidden || targets.has(e.id) || (e.type !== 'unit' && e.type !== 'model')) return;
        if (!(cat.entryLinks?.length ?? 0)) {
          targets.add(e.id);
          out.set(e.id, { key: e.id, entry: e, catalogueId: cat.id });
        }
      });
    }
    cat.catalogueLinks?.forEach((cl) => {
      if (seen.has(cl.targetId)) return;
      seen.add(cl.targetId);
      const next = index.catalogues.get(cl.targetId);
      if (next && cl.importRootEntries !== false) visit(next, true);
    });
  };
  const cat = index.catalogues.get(catalogueId);
  if (!cat) return [];
  seen.add(catalogueId);
  visit(cat, true);
  return [...out.values()];
}
