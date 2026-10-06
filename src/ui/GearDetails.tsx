import type { DataIndex } from '@/engine/bsdata/index';
import type { RawProfile, RawRule } from '@/engine/bsdata/raw';
import { toWeapon } from '@/engine/loadouts';
import { childNodes, infoOf, ruleText, type OptNode } from '@/engine/rules/nodes';
import type { WeaponProfile } from '@/engine/types';
import { AbilityList, WeaponTable } from './DatasheetView';
import { RulesText, Term } from './RulesText';

/** Everything an option brings: its weapon profiles, abilities and rules (also from what it contains). */
export function gearInfo(index: DataIndex, node: OptNode) {
  const weapons = new Map<string, WeaponProfile>();
  const abilities = new Map<string, RawProfile>();
  const rules = new Map<string, RawRule>();
  const seen = new Set<string>();
  const visit = (n: OptNode, depth: number) => {
    if (seen.has(n.key) || depth > 3) return;
    seen.add(n.key);
    const info = infoOf(index, n);
    for (const p of info.profiles) {
      if (p.hidden) continue;
      const w = toWeapon(p);
      if (w) weapons.set(`${w.name}|${w.melee}|${w.range}|${w.attacks}`, w);
      else if (p.typeName !== 'Unit') abilities.set(p.name, p);
    }
    info.rules.forEach((r) => !r.hidden && rules.set(r.name, r));
    childNodes(index, n).forEach((c) => c.kind === 'entry' && c.type !== 'model' && visit(c, depth + 1));
  };
  visit(node, 0);
  // Weapon abilities already show under the weapon's name: don't list them twice.
  const kws = new Set([...weapons.values()].flatMap((w) => w.keywords.map((k) => k.toLowerCase().replace(/\s*[\d+-].*$/, ''))));
  const own = [...rules.values()].filter((r) => !kws.has(r.name.toLowerCase().replace(/\s*[\d+-].*$/, '')));
  return { weapons: [...weapons.values()], abilities: [...abilities.values()], rules: own };
}

export function hasGearInfo(index: DataIndex | undefined, node: OptNode): boolean {
  if (!index) return false;
  const g = gearInfo(index, node);
  return g.weapons.length + g.abilities.length + g.rules.length > 0;
}

/** The dropdown under a wargear or enhancement row: what it does. */
export function GearDetails({ index, node }: { index: DataIndex; node: OptNode }) {
  const { weapons, abilities, rules } = gearInfo(index, node);
  const ranged = weapons.filter((w) => !w.melee);
  const melee = weapons.filter((w) => w.melee);
  return (
    <div className="gear-detail">
      <WeaponTable weapons={ranged} index={index} melee={false} />
      {ranged.length > 0 && melee.length > 0 && <div style={{ height: 6 }} />}
      <WeaponTable weapons={melee} index={index} melee />
      {abilities.length > 0 && <AbilityList abilities={abilities} index={index} />}
      {rules.map((r) =>
        ruleText(r) && rules.length === 1 && !weapons.length && !abilities.length ? (
          <div key={r.name}>
            <strong>{r.name}</strong>
            <RulesText text={ruleText(r)} index={index} />
          </div>
        ) : (
          <span key={r.name} style={{ marginRight: 8 }}>
            <Term term={r.name} index={index} />
          </span>
        ),
      )}
      {!weapons.length && !abilities.length && !rules.length && <p className="muted small" style={{ margin: 0 }}>No rules text for this option in the data.</p>}
    </div>
  );
}
