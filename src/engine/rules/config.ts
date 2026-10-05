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
