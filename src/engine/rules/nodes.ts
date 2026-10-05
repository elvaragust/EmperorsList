import type { DataIndex } from '../bsdata/index';
import type {
  RawAssociation,
  RawCondition,
  RawConditionGroup,
  RawConstraint,
  RawCost,
  RawEntry,
  RawLink,
  RawModifier,
  RawModifierGroup,
  RawProfile,
  RawRepeat,
  RawRule,
} from '../bsdata/raw';

/** A modifier plus the conditions of every modifierGroup it sits in (all must pass). */
export interface FlatModifier {
  mod: RawModifier;
  outer: { conditions?: RawCondition[]; conditionGroups?: RawConditionGroup[]; repeats?: RawRepeat[] }[];
}

/**
 * An option as the data offers it: an entry or group, with any entryLink merged
 * on top of its target (the link's name, extra constraints, modifiers and
 * children all apply).
 */
export interface OptNode {
  key: string;
  targetId: string;
  kind: 'entry' | 'group';
  type?: string;
  name: string;
  hidden: boolean;
  collective: boolean;
  costs: RawCost[];
  constraints: RawConstraint[];
  modifiers: FlatModifier[];
  categoryIds: string[];
  primaryCategory?: string;
  profiles: RawProfile[];
  rules: RawRule[];
  infoLinks: RawLink[];
  associations: RawAssociation[];
  defaultSelectionEntryId?: string;
  page?: string;
  /** Children sources, resolved lazily by `optionsOf`. */
  raw: (RawEntry | RawLink)[];
}

/** An entry offered under a parent, with the groups it sits in (outermost first). */
export interface OfferedEntry {
  node: OptNode;
  groups: OptNode[];
}

interface NodeCache {
  nodes: Map<string, OptNode>;
  children: Map<string, OptNode[]>;
  offered: Map<string, OfferedEntry[]>;
}

const caches = new WeakMap<DataIndex, NodeCache>();
function cacheFor(index: DataIndex): NodeCache {
  let c = caches.get(index);
  if (!c) {
    c = { nodes: new Map(), children: new Map(), offered: new Map() };
    caches.set(index, c);
  }
  return c;
}

export function flattenModifiers(mods?: RawModifier[], groups?: RawModifierGroup[], outer: FlatModifier['outer'] = []): FlatModifier[] {
  const out: FlatModifier[] = [];
  mods?.forEach((mod) => out.push({ mod, outer }));
  groups?.forEach((g) => {
    const next = [...outer, { conditions: g.conditions, conditionGroups: g.conditionGroups, repeats: g.repeats }];
    out.push(...flattenModifiers(g.modifiers, g.modifierGroups, next));
  });
  return out;
}

const isLink = (x: RawEntry | RawLink): x is RawLink => 'targetId' in x && typeof (x as RawLink).targetId === 'string';

/** Build (or fetch) the merged node for an entry or a link. */
export function nodeFor(index: DataIndex, src: RawEntry | RawLink): OptNode | undefined {
  const cache = cacheFor(index);
  const hit = cache.nodes.get(src.id);
  if (hit) return hit;

  let target: RawEntry | undefined;
  let link: RawLink | undefined;
  if (isLink(src)) {
    link = src;
    target = index.entries.get(src.targetId);
    if (!target) return undefined;
  } else {
    target = src;
  }
  const kind: OptNode['kind'] = target.type ? 'entry' : 'group';
  const catLinks = [...(target.categoryLinks ?? []), ...(link?.categoryLinks ?? [])];
  const primary = catLinks.find((c) => c.primary)?.targetId;
  const node: OptNode = {
    key: src.id,
    targetId: target.id,
    kind: link?.type === 'selectionEntryGroup' ? 'group' : kind,
    type: target.type,
    name: link?.name || target.name,
    hidden: Boolean(target.hidden || link?.hidden),
    collective: Boolean(target.collective),
    costs: link?.costs?.length ? mergeCosts(target.costs ?? [], link.costs) : (target.costs ?? []),
    constraints: [...(target.constraints ?? []), ...(link?.constraints ?? [])],
    modifiers: [
      ...flattenModifiers(target.modifiers, target.modifierGroups),
      ...flattenModifiers(link?.modifiers, link?.modifierGroups),
    ],
    categoryIds: [...new Set(catLinks.map((c) => c.targetId))],
    primaryCategory: primary,
    profiles: [...(target.profiles ?? []), ...(link?.profiles ?? [])],
    rules: [...(target.rules ?? []), ...(link?.rules ?? [])],
    infoLinks: [...(target.infoLinks ?? []), ...(link?.infoLinks ?? [])],
    associations: target.associations ?? [],
    defaultSelectionEntryId: target.defaultSelectionEntryId,
    page: target.page === undefined ? undefined : String(target.page),
    raw: [
      ...(target.selectionEntries ?? []),
      ...(target.selectionEntryGroups ?? []),
      ...(target.entryLinks ?? []),
      ...(link?.selectionEntries ?? []),
      ...(link?.selectionEntryGroups ?? []),
      ...(link?.entryLinks ?? []),
    ],
  };
  cache.nodes.set(src.id, node);
  return node;
}

function mergeCosts(base: RawCost[], over: RawCost[]): RawCost[] {
  const m = new Map(base.map((c) => [c.typeId, c]));
  over.forEach((c) => m.set(c.typeId, c));
  return [...m.values()];
}

/** Direct child options (entries and groups) of a node. Statically hidden ones are kept; effective hiding is decided by the evaluator. */
export function childNodes(index: DataIndex, node: OptNode): OptNode[] {
  const cache = cacheFor(index);
  const hit = cache.children.get(node.key);
  if (hit) return hit;
  const out: OptNode[] = [];
  for (const r of node.raw) {
    if (isLink(r) && r.type !== 'selectionEntry' && r.type !== 'selectionEntryGroup') continue;
    const n = nodeFor(index, r);
    if (n) out.push(n);
  }
  cache.children.set(node.key, out);
  return out;
}

/** Every entry selectable directly under a node, walking through groups. */
export function offeredEntries(index: DataIndex, node: OptNode): OfferedEntry[] {
  const cache = cacheFor(index);
  const hit = cache.offered.get(node.key);
  if (hit) return hit;
  const out: OfferedEntry[] = [];
  const walk = (n: OptNode, groups: OptNode[], depth: number) => {
    if (depth > 12) return;
    for (const c of childNodes(index, n)) {
      if (c.kind === 'group') walk(c, [...groups, c], depth + 1);
      else out.push({ node: c, groups });
    }
  };
  walk(node, [], 0);
  cache.offered.set(node.key, out);
  return out;
}

/** Find the offered entry for a stored selection id under a parent node. */
export function findOffered(index: DataIndex, parent: OptNode, key: string): OfferedEntry | undefined {
  return offeredEntries(index, parent).find((o) => o.node.key === key);
}

/** All groups under a node, deepest first (so inner minimums are filled before outer ones). */
export function groupsUnder(index: DataIndex, node: OptNode): { group: OptNode; depth: number; path: OptNode[] }[] {
  const out: { group: OptNode; depth: number; path: OptNode[] }[] = [];
  const walk = (n: OptNode, path: OptNode[]) => {
    if (path.length > 12) return;
    for (const c of childNodes(index, n)) {
      if (c.kind !== 'group') continue;
      const p = [...path, c];
      out.push({ group: c, depth: p.length, path: p });
      walk(c, p);
    }
  };
  walk(node, []);
  return out.sort((a, b) => b.depth - a.depth);
}

/** Profiles and rules an entry shows: its own plus the ones its infoLinks point at. */
export function infoOf(index: DataIndex, node: OptNode): { profiles: RawProfile[]; rules: RawRule[] } {
  const profiles = [...node.profiles];
  const rules = [...node.rules];
  const seen = new Set<string>();
  const follow = (links: RawLink[] | undefined, depth: number) => {
    links?.forEach((l) => {
      if (seen.has(l.id) || depth > 4) return;
      seen.add(l.id);
      if (l.type === 'profile') {
        const p = index.profiles.get(l.targetId);
        if (p) profiles.push(l.name && l.name !== p.name ? { ...p, name: p.name } : p);
      } else if (l.type === 'rule') {
        const r = index.rules.get(l.targetId);
        if (r) rules.push(l.name && /\d/.test(l.name) && l.name !== r.name ? { ...r, name: l.name } : r);
      } else if (l.type === 'infoGroup') {
        const g = index.entries.get(l.targetId);
        if (g) {
          profiles.push(...(g.profiles ?? []));
          rules.push(...(g.rules ?? []));
          follow(g.infoLinks, depth + 1);
        }
      }
    });
  };
  follow(node.infoLinks, 0);
  return { profiles, rules };
}

export const ruleText = (r: RawRule): string =>
  typeof r.description === 'string' ? r.description : (r.description?.$text ?? '');
