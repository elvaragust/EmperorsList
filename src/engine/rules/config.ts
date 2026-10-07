import type { DataIndex } from '../bsdata/index';
import type { RawEntry } from '../bsdata/raw';
import type { BattleSize, Roster, Selection } from '../types';
import { PTS } from './evaluate';
import { virtualChild, type Inst } from './instance';
import { childNodes, infoOf, offeredEntries, ruleText, type OptNode } from './nodes';
import { DP, type RootOption, type RosterEngine } from './rosterEngine';

/** Force Disposition category ids (a detachment's categories say which it suits). */
export const DISPOSITION_CATEGORIES: Record<string, string> = {
  'ecf8-cf72-7d5b-1b5b': 'Disruption',
  '0936-9767-1cc7-52ae': 'Priority Assets',
  '6fe0-3dbe-f7e0-10bb': 'Purge the Foe',
  '1cc1-f11a-4e8f-1bcc': 'Take and Hold',
  'b4a7-5083-fe94-4d24': 'Reconnaissance',
};
const THREE_DP = '7d80-2de5-816e-9d2b';
const ENH_COST = 'f759-1bc4-cb3a-f0d2';

export interface ConfigOption {
  key: string;
  name: string;
  hidden: boolean;
}
export interface BattleSizeOption extends ConfigOption {
  size: BattleSize;
  points: number;
}
export interface DetachmentOption extends ConfigOption {
  dp: number;
  /** Force Dispositions this detachment is tagged with. */
  dispositions: string[];
  threeDp: boolean;
  rules: { name: string; text: string }[];
}
export interface ToggleOption extends ConfigOption {
  rootKey: string;
  on: boolean;
}

export interface ConfigChoices {
  battleSizeRoot?: RootOption;
  detachmentRoot?: RootOption;
  dispositionRoot?: RootOption;
  battleSizes: BattleSizeOption[];
  detachments: DetachmentOption[];
  dispositions: ConfigOption[];
  /** Other army switches the data offers, such as "Show Legends". */
  toggles: ToggleOption[];
}

const SIZE_BY_NAME: [RegExp, BattleSize, number][] = [
  [/incursion/i, 'incursion', 1000],
  [/strike force/i, 'strikeForce', 2000],
  [/onslaught/i, 'onslaught', 3000],
];

function rootByName(engine: RosterEngine, re: RegExp): RootOption | undefined {
  return engine.configRoots().find((r) => re.test(r.node.name));
}

function configInst(engine: RosterEngine, root: RootOption | undefined): Inst | undefined {
  if (!root) return undefined;
  return engine.tree.force.children.find((c) => c.node?.key === root.key) ?? virtualChild(engine.tree.force, root.node, [], 1);
}

function leafOptions(engine: RosterEngine, root: RootOption | undefined, groupName?: RegExp): { node: OptNode; inst: Inst; groups: OptNode[] }[] {
  const inst = configInst(engine, root);
  if (!inst || !root) return [];
  return offeredEntries(engine.index, root.node)
    .filter((o) => !groupName || o.groups.some((g) => groupName.test(g.name)))
    .map((o) => ({ node: o.node, groups: o.groups, inst: virtualChild(inst, o.node, o.groups, 1) }));
}

export function configChoices(engine: RosterEngine): ConfigChoices {
  const ev = engine.ev;
  const battleSizeRoot = rootByName(engine, /^battle size$/i);
  const detachmentRoot = rootByName(engine, /^detachments?$/i);
  const dispositionRoot = rootByName(engine, /^force disposition$/i);

  const battleSizes: BattleSizeOption[] = leafOptions(engine, battleSizeRoot, /^battle size$/i).map(({ node, inst }) => {
    const m = SIZE_BY_NAME.find(([re]) => re.test(node.name));
    return { key: node.key, name: node.name, hidden: ev.hidden(inst), size: m?.[1] ?? 'custom', points: m?.[2] ?? 0 };
  });

  const detachments: DetachmentOption[] = leafOptions(engine, detachmentRoot).map(({ node, inst }) => {
    const cats = ev.categories(inst);
    const { rules } = infoOf(engine.index, node);
    return {
      key: node.key,
      name: node.name,
      hidden: ev.hidden(inst),
      dp: ev.cost(inst, DP),
      dispositions: [...cats].map((c) => DISPOSITION_CATEGORIES[c]).filter((x): x is string => Boolean(x)),
      threeDp: cats.has(THREE_DP),
      rules: rules.map((r) => ({ name: r.name, text: ruleText(r) })),
    };
  });

  const dispositions: ConfigOption[] = leafOptions(engine, dispositionRoot).map(({ node, inst }) => ({ key: node.key, name: node.name, hidden: ev.hidden(inst) }));

  const toggles: ToggleOption[] = [];
  for (const r of engine.configRoots()) {
    if (r === battleSizeRoot || r === detachmentRoot || r === dispositionRoot) continue;
    const v = virtualChild(engine.tree.force, r.node, [], 1);
    const hasChildren = childNodes(engine.index, r.node).length > 0;
    if (hasChildren || ev.cost(v, PTS) !== 0 || /^notice/i.test(r.node.name)) continue;
    const on = engine.tree.force.children.some((c) => c.node?.key === r.key);
    toggles.push({ key: r.key, rootKey: r.key, name: r.node.name, hidden: ev.hidden(v), on });
  }
  return { battleSizeRoot, detachmentRoot, dispositionRoot, battleSizes, detachments, dispositions, toggles };
}

function replaceConfig(roster: Roster, rootKey: string, sel: Selection | undefined): Roster {
  const config = roster.config.filter((c) => c.entryId !== rootKey);
  if (sel) config.push(sel);
  return { ...roster, config, updatedAt: Date.now() };
}

export function setBattleSize(engine: RosterEngine, roster: Roster, size: BattleSize, customPoints?: number): Roster {
  const c = configChoices(engine);
  const root = c.battleSizeRoot;
  const pick = size === 'custom' ? c.battleSizes.find((b) => b.size === 'strikeForce') : c.battleSizes.find((b) => b.size === size);
  const points = size === 'custom' ? (customPoints ?? roster.pointsLimit) : (pick?.points ?? roster.pointsLimit);
  let next: Roster = { ...roster, battleSize: size, pointsLimit: points };
  if (root && pick) next = replaceConfig(next, root.key, { entryId: root.key, count: 1, children: [{ entryId: pick.key, count: 1, children: [] }] });
  return next;
}

export function setDetachments(engine: RosterEngine, roster: Roster, keys: string[]): Roster {
  const c = configChoices(engine);
  const root = c.detachmentRoot;
  const picked = keys.map((k) => c.detachments.find((d) => d.key === k)).filter((d): d is DetachmentOption => Boolean(d));
  let next: Roster = { ...roster, detachmentIds: picked.map((d) => d.key), detachmentNames: picked.map((d) => d.name) };
  if (root) {
    next = replaceConfig(
      next,
      root.key,
      picked.length ? { entryId: root.key, count: 1, children: picked.map((d) => ({ entryId: d.key, count: 1, children: [] })) } : undefined,
    );
  }
  return next;
}

export function setDisposition(engine: RosterEngine, roster: Roster, key: string | undefined): Roster {
  const c = configChoices(engine);
  const root = c.dispositionRoot;
  const pick = c.dispositions.find((d) => d.key === key);
  let next: Roster = { ...roster, forceDisposition: pick?.name };
  if (root) next = replaceConfig(next, root.key, pick ? { entryId: root.key, count: 1, children: [{ entryId: pick.key, count: 1, children: [] }] } : undefined);
  return next;
}

export function setToggle(roster: Roster, rootKey: string, on: boolean): Roster {
  return replaceConfig(roster, rootKey, on ? { entryId: rootKey, count: 1, children: [] } : undefined);
}

export interface EnhancementInfo {
  id: string;
  name: string;
  text: string;
  pts?: number;
}

const enhCache = new WeakMap<object, Map<string, EnhancementInfo[]>>();

/**
 * Enhancements per detachment key. The data keys an enhancement's visibility
 * on its detachment's id (in its own or its group's hidden modifiers), and
 * groups are usually named "<Detachment> Enhancements".
 */
export function enhancementsByDetachment(index: DataIndex, detachments: { key: string; name: string }[]): Map<string, EnhancementInfo[]> {
  let cache = enhCache.get(index);
  if (!cache) {
    cache = new Map();
    enhCache.set(index, cache);
  }
  const out = new Map<string, EnhancementInfo[]>();
  const todo = detachments.filter((d) => {
    const hit = cache!.get(d.key);
    if (hit) out.set(d.key, hit);
    return !hit;
  });
  if (!todo.length) return out;
  const parentOf = new Map<string, RawEntry>();
  for (const g of index.entries.values()) if (!g.type) g.selectionEntries?.forEach((x) => parentOf.set(x.id, g));
  todo.forEach((d) => out.set(d.key, []));
  for (const e of index.entries.values()) {
    if (!e.costs?.some((c) => c.typeId === ENH_COST && c.value > 0)) continue;
    const json = JSON.stringify(e.modifiers ?? []);
    const parent = parentOf.get(e.id);
    const groupJson = JSON.stringify(parent?.modifiers ?? []);
    for (const d of todo) {
      if (json.includes(d.key) || groupJson.includes(d.key) || parent?.name === `${d.name} Enhancements`) {
        out.get(d.key)!.push({
          id: e.id,
          name: e.name,
          text: e.profiles?.map((p) => p.characteristics?.map((c) => c.$text ?? '').join('\n')).join('\n') ?? '',
          pts: e.costs.find((c) => c.typeId === PTS)?.value,
        });
      }
    }
  }
  todo.forEach((d) => cache!.set(d.key, out.get(d.key)!));
  return out;
}

export interface ShowOption {
  key: string;
  rootKey: string;
  name: string;
  hidden: boolean;
  on: boolean;
}

/**
 * The data's "Show/Hide Options" switches ("Show Imperial Agents", "Show
 * Imperial Knights", "Show Titans", "Show Legends"…): allied and Legends
 * datasheets stay hidden until the matching switch is on.
 */
export function showOptions(engine: RosterEngine): ShowOption[] {
  const root = [...engine.roots.values()].find((r) => /^show\s*\/\s*hide options$/i.test(r.node.name));
  if (!root) return [];
  const inst = engine.tree.force.children.find((c) => c.node?.key === root.key);
  const v = inst ?? virtualChild(engine.tree.force, root.node, [], 1);
  return offeredEntries(engine.index, root.node).map((o) => ({
    key: o.node.key,
    rootKey: root.key,
    name: o.node.name,
    hidden: engine.ev.hidden(virtualChild(v, o.node, o.groups, 1)),
    on: Boolean(inst?.children.some((c) => c.node?.key === o.node.key && c.count > 0)),
  }));
}

/** Turn some Show/Hide switches on or off (others are kept). */
export function setShowOptions(engine: RosterEngine, roster: Roster, changes: Record<string, boolean>): Roster {
  const opts = showOptions(engine);
  if (!opts.length) return roster;
  const rootKey = opts[0]!.rootKey;
  const on = new Set(opts.filter((o) => o.on).map((o) => o.key));
  for (const [k, v] of Object.entries(changes)) v ? on.add(k) : on.delete(k);
  return replaceConfig(roster, rootKey, on.size ? { entryId: rootKey, count: 1, children: [...on].map((k) => ({ entryId: k, count: 1, children: [] })) } : undefined);
}
