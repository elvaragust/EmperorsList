import type { RosterUnit, Selection } from '../types';
import { PTS } from './evaluate';
import { virtualChild, type Inst } from './instance';
import { groupsUnder, offeredEntries, type OptNode } from './nodes';
import type { RosterEngine } from './rosterEngine';

/** Address of a selection inside a unit: indices into `children` arrays, [] = the unit itself. */
export type SelPath = number[];

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));

/**
 * Build a selection with the data's defaults filled in: every option with a
 * minimum, and each group's minimum from its default entry (or first entry).
 */
export function buildDefault(engine: RosterEngine, parent: Inst, node: OptNode, groups: OptNode[], count: number): Selection {
  const sel: Selection = { entryId: node.key, count, children: [] };
  const inst = virtualChild(parent, node, groups, count);
  inst.sel = sel;
  fillDefaults(engine, inst, node, sel);
  return sel;
}

function fillDefaults(engine: RosterEngine, inst: Inst, node: OptNode, sel: Selection, depth = 0) {
  if (depth > 10) return;
  const index = engine.index;
  const ev = engine.ev;
  const offered = offeredEntries(index, node);
  const addChild = (o: { node: OptNode; groups: OptNode[] }, n: number) => {
    const existing = inst.children.find((c) => c.node?.key === o.node.key);
    if (existing && existing.sel) {
      existing.sel.count += n;
      existing.count += n;
      return;
    }
    const childSel: Selection = { entryId: o.node.key, count: n, children: [] };
    const ci = virtualChild(inst, o.node, o.groups, n);
    ci.sel = childSel;
    inst.children.push(ci);
    sel.children.push(childSel);
    fillDefaults(engine, ci, o.node, childSel, depth + 1);
  };
  const groupHidden = (gs: OptNode[]) => gs.some((g, i) => ev.hidden(virtualChild(inst, g, gs.slice(0, i))));

  for (const o of offered) {
    const v = virtualChild(inst, o.node, o.groups, 1);
    if (ev.hidden(v) || groupHidden(o.groups)) continue;
    const { min } = engine.limits(o.node, v);
    if (min > 0) addChild(o, min);
  }
  for (const { group, path } of groupsUnder(index, node)) {
    const gv = virtualChild(inst, group, path.slice(0, -1));
    if (ev.hidden(gv) || groupHidden(path.slice(0, -1))) continue;
    const { min } = engine.limits(group, gv);
    if (min <= 0) continue;
    const have = inst.children.filter((c) => c.ids.has(group.key)).reduce((s, c) => s + c.count, 0);
    if (have >= min) continue;
    const inGroup = offered.filter((o) => o.groups.some((g) => g.key === group.key));
    const visible = inGroup.filter((o) => !ev.hidden(virtualChild(inst, o.node, o.groups, 1)));
    // Default entry first, then the rest in data order, each up to its own maximum.
    const isDefault = (o: { node: OptNode }) => o.node.key === group.defaultSelectionEntryId || o.node.targetId === group.defaultSelectionEntryId;
    const ordered = [...visible.filter(isDefault), ...visible.filter((o) => !isDefault(o))];
    let need = min - have;
    for (const o of ordered) {
      if (need <= 0) break;
      const { max } = engine.limits(o.node, virtualChild(inst, o.node, o.groups, 1));
      const current = inst.children.filter((c) => c.node?.key === o.node.key).reduce((s, c) => s + c.count, 0);
      const room = max < 0 ? need : Math.max(0, max - current);
      const n = Math.min(need, room);
      if (n > 0) {
        addChild(o, n);
        need -= n;
      }
    }
  }
}

/** A new unit with its default models and wargear. */
export function newUnit(engine: RosterEngine, rootKey: string): RosterUnit {
  const root = engine.roots.get(rootKey);
  if (!root) throw new Error(`Unknown unit ${rootKey}`);
  const sel = buildDefault(engine, engine.tree.force, root.node, [], 1);
  const v = virtualChild(engine.tree.force, root.node, [], 1);
  return {
    id: uid(),
    entryId: rootKey,
    name: engine.ev.name(v),
    points: 0,
    primaryCategory: root.node.primaryCategory ?? '',
    selections: sel.children,
  };
}

/** A new top-level army configuration selection (Battle Size, Detachment ...). */
export function newConfig(engine: RosterEngine, rootKey: string): Selection {
  const root = engine.roots.get(rootKey);
  if (!root) throw new Error(`Unknown option ${rootKey}`);
  return buildDefault(engine, engine.tree.force, root.node, [], 1);
}

// ---------- path helpers ----------

export function selAt(unit: RosterUnit, path: SelPath): Selection | undefined {
  let list = unit.selections;
  let cur: Selection | undefined;
  for (const i of path) {
    cur = list[i];
    if (!cur) return undefined;
    list = cur.children;
  }
  return cur;
}

export function instAt(engine: RosterEngine, unitId: string, path: SelPath): Inst | undefined {
  let cur = engine.unitInst(unitId);
  for (const i of path) {
    const sel = cur?.sel?.children[i];
    cur = cur?.children.find((c) => c.sel === sel);
    if (!cur) return undefined;
  }
  return cur;
}

/** Immutable update of the children list at a path. */
export function updateChildren(unit: RosterUnit, path: SelPath, fn: (children: Selection[]) => Selection[]): RosterUnit {
  const rec = (list: Selection[], depth: number): Selection[] => {
    if (depth === path.length) return fn(list);
    const i = path[depth]!;
    return list.map((s, k) => (k === i ? { ...s, children: rec(s.children, depth + 1) } : s));
  };
  return { ...unit, selections: rec(unit.selections, 0) };
}

const same = (a: Selection, b: Selection): boolean =>
  a.entryId === b.entryId &&
  a.children.length === b.children.length &&
  a.children.every((c, i) => c.count === b.children[i]!.count && same(c, b.children[i]!));

/** Merge sibling selections that are identical (same option, same wargear). */
export function mergeIdentical(list: Selection[]): Selection[] {
  const out: Selection[] = [];
  for (const s of list) {
    const twin = out.find((o) => same(o, s));
    if (twin) twin.count += s.count;
    else out.push({ ...s, children: mergeIdentical(s.children) });
  }
  return out.filter((s) => s.count > 0);
}

/**
 * Set how many of an option a selection holds. Growing adds defaulted copies
 * (or grows the first existing one); shrinking takes from the last ones.
 * Picking in a choose-one group swaps out the other choice.
 */
export function setOptionCount(engine: RosterEngine, unit: RosterUnit, parentPath: SelPath, key: string, count: number): RosterUnit {
  const parent = instAt(engine, unit.id, parentPath);
  if (!parent?.node) return unit;
  const offered = offeredEntries(engine.index, parent.node).find((o) => o.node.key === key);
  if (!offered) return unit;
  const current = parent.children.filter((c) => c.node?.key === key).reduce((s, c) => s + c.count, 0);
  const delta = count - current;
  if (delta === 0) return unit;

  // Choose-one groups: when the innermost group allows a single pick, replace the other pick.
  const innermost = offered.groups[offered.groups.length - 1];
  let swapOut: string[] = [];
  if (innermost && delta > 0) {
    const { max } = engine.limits(innermost, virtualChild(parent, innermost, offered.groups.slice(0, -1)));
    if (max === 1) {
      swapOut = offeredEntries(engine.index, parent.node)
        .filter((o) => o.node.key !== key && o.groups.some((g) => g.key === innermost.key))
        .map((o) => o.node.key);
    }
  }

  const fresh = delta > 0 && current === 0 ? buildDefault(engine, parent, offered.node, offered.groups, delta) : undefined;
  return updateChildren(unit, parentPath, (children) => {
    let list = children.filter((c) => !swapOut.includes(c.entryId)).map((c) => ({ ...c }));
    if (delta > 0) {
      const first = list.find((c) => c.entryId === key);
      if (first) first.count += delta;
      else if (fresh) list.push(fresh);
    } else {
      let take = -delta;
      for (let i = list.length - 1; i >= 0 && take > 0; i--) {
        const c = list[i]!;
        if (c.entryId !== key) continue;
        const t = Math.min(c.count, take);
        c.count -= t;
        take -= t;
      }
      list = list.filter((c) => c.count > 0);
    }
    return list;
  });
}

/** Split one model off a "5×" selection so it can carry different wargear. */
export function splitOne(unit: RosterUnit, path: SelPath): RosterUnit {
  if (!path.length) return unit;
  const parentPath = path.slice(0, -1);
  const i = path[path.length - 1]!;
  return updateChildren(unit, parentPath, (children) => {
    const s = children[i];
    if (!s || s.count < 2) return children;
    const copy: Selection = structuredClone({ ...s, count: 1 });
    return [...children.slice(0, i), { ...s, count: s.count - 1 }, copy, ...children.slice(i + 1)];
  });
}

export function removeAt(unit: RosterUnit, path: SelPath): RosterUnit {
  if (!path.length) return unit;
  const i = path[path.length - 1]!;
  return updateChildren(unit, path.slice(0, -1), (children) => children.filter((_, k) => k !== i));
}

/** Refresh the cached name/points/category on every unit after any change. */
export function refreshCaches(engine: RosterEngine, units: RosterUnit[]): RosterUnit[] {
  return units.map((u) => {
    const inst = engine.unitInst(u.id);
    if (!inst) return u;
    return {
      ...u,
      name: engine.ev.name(inst),
      points: engine.subtreeCost(inst, PTS),
      primaryCategory: inst.node?.primaryCategory ?? u.primaryCategory,
    };
  });
}

/**
 * After an edit, pick anything the rules now require: e.g. a sergeant whose
 * weapon must match the rest of the squad follows when the squad's weapon
 * changes. Runs a few passes, rebuilding the engine each time.
 */
export function autoFill(engineFor: (u: RosterUnit) => RosterEngine, unit: RosterUnit, maxPasses = 6): RosterUnit {
  let current = unit;
  for (let pass = 0; pass < maxPasses; pass++) {
    const engine = engineFor(current);
    const fix = findRequired(engine, current.id);
    if (!fix) return current;
    const next = setOptionCount(engine, current, fix.path, fix.key, fix.count);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function findRequired(engine: RosterEngine, unitId: string): { path: SelPath; key: string; count: number } | undefined {
  const root = engine.unitInst(unitId);
  if (!root) return undefined;
  const visit = (inst: Inst, path: SelPath): { path: SelPath; key: string; count: number } | undefined => {
    const views = engine.optionsUnder(inst);
    const flat = (vs: ReturnType<RosterEngine['optionsUnder']>, inChoice: boolean): { path: SelPath; key: string; count: number } | undefined => {
      for (const v of vs) {
        if (v.kind === 'group') {
          const r = flat(v.children, v.max === 1);
          if (r) return r;
        } else if (!v.hidden && v.min > v.selected && inChoice && v.node.type !== 'model') {
          return { path, key: v.node.key, count: v.min };
        }
      }
      return undefined;
    };
    const here = flat(views, false);
    if (here) return here;
    for (let i = 0; i < (inst.sel?.children.length ?? 0); i++) {
      const child = inst.children.find((c) => c.sel === inst.sel!.children[i]);
      if (!child) continue;
      const r = visit(child, [...path, i]);
      if (r) return r;
    }
    return undefined;
  };
  return visit(root, []);
}

/**
 * Pick an option on every model in the unit that offers one with the same
 * name (for squads whose models must all carry the same weapon), then let
 * `autoFill` settle anything else the rules require.
 */
export function setForWholeUnit(engineFor: (u: RosterUnit) => RosterEngine, unit: RosterUnit, optionName: string): RosterUnit {
  let current = unit;
  const engine = engineFor(current);
  const root = engine.unitInst(unit.id);
  if (!root) return unit;
  const targets: { path: SelPath; key: string }[] = [];
  const visit = (inst: Inst, path: SelPath) => {
    if (inst.node) {
      const hit = offeredEntries(engine.index, inst.node).find((o) => o.node.name === optionName && o.groups.length > 0);
      if (hit && path.length) targets.push({ path, key: hit.node.key });
    }
    inst.sel?.children.forEach((sel, i) => {
      const child = inst.children.find((c) => c.sel === sel);
      if (child) visit(child, [...path, i]);
    });
  };
  visit(root, []);
  for (const t of targets) {
    const e = engineFor(current);
    const inst = instAt(e, current.id, t.path);
    if (!inst) continue;
    const already = inst.children.some((c) => c.node?.key === t.key && c.count > 0);
    if (!already) current = setOptionCount(e, current, t.path, t.key, 1);
  }
  return autoFill(engineFor, current);
}
