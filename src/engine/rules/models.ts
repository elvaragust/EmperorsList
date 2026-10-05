import type { RawProfile, RawRule } from '../bsdata/raw';
import { toWeapon } from '../loadouts';
import type { ModelInstance, ModelLoadout, WeaponProfile } from '../types';
import type { Inst } from './instance';
import { childNodes, findOffered, infoOf, type OptNode } from './nodes';
import type { RosterEngine } from './rosterEngine';

export interface UnitModels {
  loadouts: ModelLoadout[];
  models: ModelInstance[];
  weapons: Map<string, WeaponProfile>;
}

/** Same name + same stats = same column, even when the data uses different profile ids. */
const weaponSig = (w: WeaponProfile) => [w.name.toLowerCase(), w.melee, w.range, w.attacks, w.skill, w.strength, w.ap, w.damage].join('|');

/**
 * Models and their weapons for a roster unit, from what is actually selected.
 * Each model selection becomes a loadout row; identical models (same weapons)
 * share a key so the grid shows them as "3×". Model ids are stable per path,
 * so casualties survive re-renders.
 */
export function unitModels(engine: RosterEngine, unitId: string, prefix = ''): UnitModels {
  const out: UnitModels = { loadouts: [], models: [], weapons: new Map() };
  const root = engine.unitInst(unitId);
  if (!root) return out;
  const bySig = new Map<string, string>();
  const index = engine.index;

  const collectWeapons = (inst: Inst, acc: string[]) => {
    if (!inst.node || inst.count <= 0) return;
    const { profiles } = infoOf(index, inst.node);
    for (const p of profiles) {
      const w = toWeapon(p);
      if (!w) continue;
      const sig = weaponSig(w);
      const id = bySig.get(sig) ?? w.id;
      bySig.set(sig, id);
      if (!out.weapons.has(id)) out.weapons.set(id, { ...w, id });
      for (let k = 0; k < inst.count; k++) acc.push(id);
    }
    for (const c of inst.children) {
      if (c.node?.type === 'model' || c.node?.type === 'unit') continue;
      collectWeapons(c, acc);
    }
  };

  const groupLabel = (parent: Inst, inst: Inst): string => {
    if (!parent.node || !inst.node) return engine.ev.name(inst);
    const offered = findOffered(index, parent.node, inst.node.key);
    const g = offered?.groups[offered.groups.length - 1];
    if (g && !childNodes(index, g).some((c: OptNode) => c.kind === 'group')) return g.name;
    return engine.ev.name(inst);
  };

  const addModel = (inst: Inst, parent: Inst | undefined, path: string) => {
    const weaponIds: string[] = [];
    // A model's own profiles plus everything selected under it.
    collectWeapons({ ...inst, count: 1 }, weaponIds);
    const name = engine.ev.name(inst);
    const key = `${name}|${[...weaponIds].sort().join(',')}`;
    if (!out.loadouts.some((l) => l.key === key)) {
      out.loadouts.push({ key, name, group: parent ? groupLabel(parent, inst) : name, weaponIds });
    }
    for (let n = 0; n < Math.max(inst.count, 1); n++) out.models.push({ id: `${prefix}${path}#${n}`, loadoutKey: key, alive: true });
  };

  const hasModel = (i: Inst): boolean => i.children.some((c) => c.node?.type === 'model' || hasModel(c));
  const unitWeapons: string[] = [];
  const visit = (inst: Inst, path: string) => {
    inst.children.forEach((c, i) => {
      const p = path ? `${path}.${i}` : String(i);
      if (c.count <= 0) return;
      if (c.node?.type === 'model') addModel(c, inst, p);
      else if (c.node?.type === 'unit' || hasModel(c)) visit(c, p);
      else if (inst === root) collectWeapons(c, unitWeapons);
    });
  };

  if (root.node?.type === 'model') addModel(root, undefined, 'r');
  else visit(root, '');

  if (unitWeapons.length) {
    if (out.loadouts.length === 1) {
      // Single-model units list wargear at unit level: give it to the model.
      out.loadouts[0]!.weaponIds.push(...unitWeapons);
    } else {
      const key = `unit|${unitWeapons.join(',')}`;
      out.loadouts.push({ key, name: 'Unit wargear', group: 'Unit wargear', weaponIds: unitWeapons });
      out.models.push({ id: `${prefix}u#0`, loadoutKey: key, alive: true });
    }
  }
  return out;
}

export interface Datasheet {
  name: string;
  stats: RawProfile[];
  abilities: RawProfile[];
  rules: RawRule[];
  keywords: string[];
  factionKeywords: string[];
  other: RawProfile[];
}

/** The datasheet parts of a unit: unit profiles, abilities, core rules and keywords. */
export function datasheet(engine: RosterEngine, inst: Inst): Datasheet {
  const index = engine.index;
  const stats = new Map<string, RawProfile>();
  const abilities = new Map<string, RawProfile>();
  const other = new Map<string, RawProfile>();
  const rules = new Map<string, RawRule>();
  const visit = (i: Inst, depth: number) => {
    if (!i.node || depth > 8 || i.count <= 0) return;
    const info = infoOf(index, i.node);
    for (const p of info.profiles) {
      if (p.hidden) continue;
      if (p.typeName === 'Unit') stats.set(p.name + p.characteristics?.map((c) => c.$text).join(), p);
      else if (p.typeName === 'Abilities') abilities.set(p.name, p);
      else if (p.typeName !== 'Ranged Weapons' && p.typeName !== 'Melee Weapons') other.set(p.name, p);
    }
    info.rules.forEach((r) => !r.hidden && rules.set(r.name, r));
    i.children.forEach((c) => visit(c, depth + 1));
  };
  visit(inst, 0);
  const cats = [...engine.ev.categories(inst)].map((id) => index.categories.get(id)?.name).filter((n): n is string => Boolean(n));
  const factionKeywords = cats.filter((n) => n.startsWith('Faction: ')).map((n) => n.slice(9));
  const keywords = cats.filter((n) => !n.startsWith('Faction: ') && n !== 'Configuration' && n !== 'Unit' && !n.startsWith('Allies:'));
  return {
    name: engine.ev.name(inst),
    stats: [...stats.values()],
    abilities: [...abilities.values()],
    rules: [...rules.values()],
    keywords,
    factionKeywords,
    other: [...other.values()],
  };
}
