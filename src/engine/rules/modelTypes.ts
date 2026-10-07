import { autoFill, instAt, mergeIdentical, setOptionCount, type SelPath } from './edit';
import type { Inst } from './instance';
import type { OptNode } from './nodes';
import type { OptionView, RosterEngine } from './rosterEngine';
import type { RosterUnit, Selection } from '../types';

/**
 * The unit as the official app shows it: one section per kind of model
 * ("Sword Brother", "Initiate", "Neophyte"), with how many there are and,
 * for every wargear option, how many of those models carry it.
 */
export interface ModelOption {
  key: string;
  name: string;
  points: number;
  /** Models of this kind that carry it. */
  carried: number;
  hidden: boolean;
  /** The data entry, for showing the weapon's profile. */
  node: OptNode;
}

export interface ModelGroup {
  key: string;
  name: string;
  /** Exactly one per model (radio when one model, counters otherwise). */
  chooseOne: boolean;
  /** A choice can be left empty. */
  optional: boolean;
  defaultKey?: string;
  options: ModelOption[];
}

export interface ModelType {
  /** Option key of the model entry; '' when the unit itself is the model. */
  key: string;
  name: string;
  /** The model group it belongs to, with its limits ("Initiates", 5–11). */
  group?: { name: string; selected: number; min: number; max: number };
  count: number;
  min: number;
  max: number;
  points: number;
  /** Wargear every model of this kind always carries. */
  fixed: { name: string; count: number; node: OptNode }[];
  /** Single options with no group (toggle per model, e.g. "Hand flamer"). */
  extras: ModelOption[];
  groups: ModelGroup[];
}

function optionsOf(engine: RosterEngine, insts: Inst[]): Pick<ModelType, 'fixed' | 'extras' | 'groups'> {
  const first = insts[0];
  if (!first) return { fixed: [], extras: [], groups: [] };
  const views = engine.optionsUnder(first);
  const carried = (key: string) => insts.reduce((n, i) => n + (i.children.some((c) => c.node?.key === key && c.count > 0) ? i.count : 0), 0);
  const total = insts.reduce((n, i) => n + i.count, 0);
  const fixed: ModelType['fixed'] = [];
  const extras: ModelOption[] = [];
  const groups: ModelGroup[] = [];
  const opt = (v: OptionView): ModelOption => ({ key: v.node.key, name: v.name, points: v.points, carried: carried(v.node.key), hidden: v.hidden, node: v.node });
  const visitGroup = (g: OptionView, prefix: string) => {
    if (g.hidden && !g.selected) return;
    const entries = g.children.filter((c) => c.kind === 'entry');
    if (entries.length) {
      groups.push({
        key: g.node.key,
        name: prefix ? `${prefix} · ${g.name}` : g.name,
        chooseOne: g.max === 1,
        optional: g.min === 0,
        defaultKey: g.defaultKey,
        options: entries.filter((e) => !(e.hidden && !e.selected)).map(opt),
      });
    }
    g.children.filter((c) => c.kind === 'group').forEach((c) => visitGroup(c, g.name));
  };
  for (const v of views) {
    if (v.kind === 'group') {
      if (/enhancement/i.test(v.name)) continue;
      visitGroup(v, '');
    } else if (v.node.type !== 'model') {
      if (v.hidden && !v.selected) continue;
      if (v.name === 'Warlord' || v.node.categoryIds.includes('5c0e-4c31-d51b-e470')) continue;
      const c = carried(v.node.key);
      if (v.min === v.max && v.max >= 1 && c === total) fixed.push({ name: v.name, count: v.min, node: v.node });
      else extras.push(opt(v));
    }
  }
  return { fixed, extras, groups };
}

/** Model kinds of a unit with their counts and wargear counts. */
export function modelTypes(engine: RosterEngine, unitId: string): ModelType[] {
  const root = engine.unitInst(unitId);
  if (!root?.node) return [];
  if (root.node.type === 'model') {
    return [{ key: '', name: engine.ev.name(root), count: 1, min: 1, max: 1, points: 0, ...optionsOf(engine, [root]) }];
  }
  const out: ModelType[] = [];
  const views = engine.optionsUnder(root);
  const walk = (vs: OptionView[], group?: OptionView) => {
    for (const v of vs) {
      if (v.kind === 'group') walk(v.children, v);
      else if (v.node.type === 'model' && !(v.hidden && !v.selected)) {
        const insts = root.children.filter((c) => c.node?.key === v.node.key && c.count > 0);
        out.push({
          key: v.node.key,
          name: v.name,
          group: group ? { name: group.name, selected: group.selected, min: group.min, max: group.max } : undefined,
          count: v.selected,
          min: v.min,
          max: v.max,
          points: v.points,
          ...optionsOf(engine, insts),
        });
      }
    }
  };
  walk(views);
  // Models nested one level down (e.g. "5 models" upgrades): show those too.
  if (!out.length) {
    for (const c of root.children) {
      for (const m of c.children) {
        if (m.node?.type !== 'model') continue;
        if (out.some((o) => o.key === m.node!.key)) continue;
        const insts = c.children.filter((x) => x.node?.key === m.node!.key);
        out.push({ key: m.node.key, name: engine.ev.name(m), count: insts.reduce((n, i) => n + i.count, 0), min: 0, max: 0, points: 0, ...optionsOf(engine, insts) });
      }
    }
  }
  return out;
}

const clone = (s: Selection): Selection => ({ ...s, children: s.children.map(clone) });

/**
 * Make exactly `n` models of a kind carry an option. Models are split into
 * single selections, changed one by one (a choose-one group swaps the old
 * choice out; taking the option away puts the group's default back), then
 * identical models are merged again and the rules' requirements filled in.
 */
export function setModelsWithOption(engineFor: (u: RosterUnit) => RosterEngine, unit: RosterUnit, modelKey: string, optionKey: string, n: number, group?: ModelGroup, avoid?: Set<string>): RosterUnit {
  // The unit itself is the model (characters, vehicles).
  if (!modelKey) {
    let u = setOptionCount(engineFor(unit), unit, [], optionKey, n > 0 ? 1 : 0);
    if (n <= 0 && group?.chooseOne && !group.optional) {
      const fallback = group.options.find((o) => o.key === group.defaultKey && o.key !== optionKey) ?? group.options.find((o) => o.key !== optionKey);
      if (fallback) u = setOptionCount(engineFor(u), u, [], fallback.key, 1);
    }
    return autoFill(engineFor, u);
  }
  // 1. One selection per model.
  const split: Selection[] = [];
  for (const s of unit.selections) {
    if (s.entryId === modelKey && s.count > 1) for (let i = 0; i < s.count; i++) split.push({ ...clone(s), count: 1 });
    else split.push(s);
  }
  let u: RosterUnit = { ...unit, selections: split };
  const idx = split.map((s, i) => (s.entryId === modelKey ? i : -1)).filter((i) => i >= 0);
  const has = (eng: RosterEngine, i: number) => Boolean(instAt(eng, u.id, [i])?.children.some((c) => c.node?.key === optionKey && c.count > 0));
  let eng = engineFor(u);
  const withIt = idx.filter((i) => has(eng, i));
  // Models already given another of these choices (e.g. during an import) are changed last.
  const busy = (i: number) => Boolean(avoid?.size && instAt(eng, u.id, [i])?.children.some((c) => c.count > 0 && avoid.has(c.node?.key ?? '')));
  const without = idx.filter((i) => !has(eng, i)).sort((a, b) => Number(busy(a)) - Number(busy(b)));
  const target = Math.max(0, Math.min(n, idx.length));
  if (target > withIt.length) {
    for (const i of without.slice(0, target - withIt.length)) {
      u = setOptionCount(eng, u, [i], optionKey, 1);
      eng = engineFor(u);
    }
  } else if (target < withIt.length) {
    for (const i of withIt.slice(target).reverse()) {
      u = setOptionCount(eng, u, [i], optionKey, 0);
      eng = engineFor(u);
      if (group?.chooseOne && !group.optional) {
        const fallback = group.options.find((o) => o.key === group.defaultKey && o.key !== optionKey) ?? group.options.find((o) => o.key !== optionKey);
        if (fallback) {
          u = setOptionCount(eng, u, [i], fallback.key, 1);
          eng = engineFor(u);
        }
      }
    }
  }
  // 3. Merge identical models back together.
  u = { ...u, selections: mergeIdentical(u.selections) };
  return autoFill(engineFor, u);
}

/**
 * Add models the datasheet requires but the unit doesn't have: first any kind
 * below its own minimum (the Sergeant), then a model group below its minimum
 * (topped up with the kind that has room). Returns what was added.
 */
export function fillMinimumModels(engineFor: (u: RosterUnit) => RosterEngine, unit: RosterUnit): { unit: RosterUnit; added: string[] } {
  let u = unit;
  const added: string[] = [];
  for (let pass = 0; pass < 8; pass++) {
    const e = engineFor(u);
    const types = modelTypes(e, u.id).filter((t) => t.key);
    const short = types.find((t) => t.count < t.min);
    if (short) {
      u = setOptionCount(e, u, [], short.key, short.min);
      added.push(`${short.min - short.count}× ${short.name}`);
      continue;
    }
    const low = types.find((t) => t.group && t.group.min > 0 && t.group.selected < t.group.min);
    if (low?.group) {
      const need = low.group.min - low.group.selected;
      const room = (t: ModelType) => (t.max < 0 ? 999 : t.max - t.count);
      const target = types.filter((t) => t.group?.name === low.group!.name && room(t) > 0).sort((a, b) => room(b) - room(a))[0];
      if (!target) break;
      const to = target.count + Math.min(need, room(target));
      u = setOptionCount(e, u, [], target.key, to);
      added.push(`${to - target.count}× ${target.name}`);
      continue;
    }
    break;
  }
  return { unit: u, added };
}

export type { SelPath };
