import type { DataIndex } from '../bsdata/index';
import type { RawForceEntry } from '../bsdata/raw';
import type { Roster, RosterUnit, Selection } from '../types';
import { findOffered, nodeFor, type OptNode } from './nodes';

/** The Army Roster force entry in the 11th edition game system. */
export const ARMY_ROSTER_FORCE = 'bb9d-299a-ed60-2d8a';

/**
 * A live selection in a roster, the shape conditions are evaluated against.
 * The tree is roster -> force -> army config and units -> models -> wargear.
 */
export interface Inst {
  kind: 'roster' | 'force' | 'selection';
  node?: OptNode;
  sel?: Selection;
  /** Set on unit roots. */
  unit?: RosterUnit;
  count: number;
  parent?: Inst;
  children: Inst[];
  /** Ids this instance answers to: option key, entry id, the groups it was picked from. */
  ids: Set<string>;
  /** Ids of the groups between this selection and its parent selection. */
  groupIds: string[];
  order: number;
  /** Not part of the roster yet: used to ask "would this option be allowed/hidden?". */
  virtual?: boolean;
  /** Leaders/support attached to this unit (unit roots only). */
  attached?: Inst[];
  /** Force only. */
  forceEntry?: RawForceEntry;
  catalogueId?: string;
}

export interface RosterTree {
  root: Inst;
  force: Inst;
  units: Map<string, Inst>;
  /** Unit roots that could not be resolved in the loaded data. */
  missing: RosterUnit[];
  /** Selections that could not be resolved (data changed since the list was built). */
  orphans: { unitId?: string; entryId: string }[];
}

let orderSeq = 0;

function makeSelectionInst(index: DataIndex, parent: Inst, parentNode: OptNode | undefined, sel: Selection, orphans: RosterTree['orphans'], unitId?: string): Inst | undefined {
  let node: OptNode | undefined;
  let groupIds: string[] = [];
  if (parentNode) {
    const offered = findOffered(index, parentNode, sel.entryId);
    if (offered) {
      node = offered.node;
      groupIds = offered.groups.flatMap((g) => [g.key, g.targetId]);
    }
  }
  if (!node) {
    const e = index.entries.get(sel.entryId);
    node = e ? nodeFor(index, e) : undefined;
  }
  if (!node) {
    orphans.push({ unitId, entryId: sel.entryId });
    return undefined;
  }
  const inst: Inst = {
    kind: 'selection',
    node,
    sel,
    count: sel.count,
    parent,
    children: [],
    ids: new Set([node.key, node.targetId, ...groupIds]),
    groupIds,
    order: orderSeq++,
  };
  for (const c of sel.children) {
    const ci = makeSelectionInst(index, inst, node, c, orphans, unitId);
    if (ci) inst.children.push(ci);
  }
  return inst;
}

/** Root options (config and units) indexed by key, for resolving top-level selections. */
export type RootLookup = (key: string) => OptNode | undefined;

export function buildRosterTree(index: DataIndex, roster: Roster, roots: RootLookup): RosterTree {
  orderSeq = 0;
  const root: Inst = { kind: 'roster', count: 1, children: [], ids: new Set(['roster']), groupIds: [], order: orderSeq++ };
  const forceEntry = index.forceEntries.get(ARMY_ROSTER_FORCE);
  const force: Inst = {
    kind: 'force',
    count: 1,
    parent: root,
    children: [],
    ids: new Set([ARMY_ROSTER_FORCE, roster.catalogueId]),
    groupIds: [],
    order: orderSeq++,
    forceEntry,
    catalogueId: roster.catalogueId,
  };
  root.children.push(force);
  const tree: RosterTree = { root, force, units: new Map(), missing: [], orphans: [] };

  for (const sel of roster.config) {
    const node = roots(sel.entryId);
    if (!node) {
      tree.orphans.push({ entryId: sel.entryId });
      continue;
    }
    const inst = rootInst(index, force, node, sel, tree.orphans);
    force.children.push(inst);
  }
  for (const unit of roster.units) {
    const node = roots(unit.entryId);
    if (!node) {
      tree.missing.push(unit);
      continue;
    }
    const sel: Selection = { entryId: unit.entryId, count: 1, children: unit.selections };
    const inst = rootInst(index, force, node, sel, tree.orphans, unit.id);
    inst.unit = unit;
    inst.attached = [];
    force.children.push(inst);
    tree.units.set(unit.id, inst);
  }
  for (const unit of roster.units) {
    if (!unit.leaderOf) continue;
    const leader = tree.units.get(unit.id);
    const body = tree.units.get(unit.leaderOf);
    if (leader && body) body.attached!.push(leader);
  }
  return tree;
}

function rootInst(index: DataIndex, force: Inst, node: OptNode, sel: Selection, orphans: RosterTree['orphans'], unitId?: string): Inst {
  const inst: Inst = {
    kind: 'selection',
    node,
    sel,
    count: sel.count,
    parent: force,
    children: [],
    ids: new Set([node.key, node.targetId]),
    groupIds: [],
    order: orderSeq++,
  };
  for (const c of sel.children) {
    const ci = makeSelectionInst(index, inst, node, c, orphans, unitId);
    if (ci) inst.children.push(ci);
  }
  return inst;
}

/** A not-yet-chosen option placed under a parent, to evaluate its hidden state and limits. */
export function virtualChild(parent: Inst, node: OptNode, groups: OptNode[] = [], count = 0): Inst {
  const groupIds = groups.flatMap((g) => [g.key, g.targetId]);
  return {
    kind: 'selection',
    node,
    count,
    parent,
    children: [],
    ids: new Set([node.key, node.targetId, ...groupIds]),
    groupIds,
    order: Number.MAX_SAFE_INTEGER,
    virtual: true,
  };
}

/** Depth-first walk over an instance and everything below it. */
export function* descendants(inst: Inst, includeSelf = false): Generator<Inst> {
  if (includeSelf) yield inst;
  for (const c of inst.children) yield* descendants(c, true);
}

export function unitRootOf(inst: Inst): Inst | undefined {
  let cur: Inst | undefined = inst;
  while (cur && cur.parent && cur.parent.kind === 'selection') cur = cur.parent;
  return cur?.kind === 'selection' ? cur : undefined;
}

export function forceOf(inst: Inst): Inst | undefined {
  let cur: Inst | undefined = inst;
  while (cur && cur.kind !== 'force') cur = cur.parent;
  return cur;
}

export function rosterOf(inst: Inst): Inst {
  let cur = inst;
  while (cur.parent) cur = cur.parent;
  return cur;
}
