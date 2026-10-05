import { childrenOf, type DataIndex } from './bsdata/index';
import type { RawEntry, RawProfile } from './bsdata/raw';
import type { ModelLoadout, WeaponProfile } from './types';

const char = (p: RawProfile, name: string) => p.characteristics?.find((c) => c.name === name)?.$text ?? '';

/** Short column code from a weapon name: "Heavy Bolt Pistol" -> "HBP". Users can override later. */
export function shortCode(name: string): string {
  const clean = name.replace(/^[^A-Za-z0-9]+/, '').trim();
  const mode = clean.match(/^(.*?)\s+[-–—]\s+(.+)$/);
  if (mode) return `${shortCode(mode[1]!)}-${mode[2]!.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()}`;
  const words = clean
    .replace(/[–—-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(w\/|and|of|the|&)$/i.test(w));
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return words.map((w) => w[0]!.toUpperCase()).join('').slice(0, 4);
}

export function toWeapon(p: RawProfile): WeaponProfile | undefined {
  const melee = p.typeName === 'Melee Weapons';
  if (!melee && p.typeName !== 'Ranged Weapons') return undefined;
  const kw = char(p, 'Keywords');
  return {
    id: p.id,
    name: p.name,
    short: shortCode(p.name),
    melee,
    range: char(p, 'Range'),
    attacks: char(p, 'A'),
    skill: melee ? char(p, 'WS') : char(p, 'BS'),
    strength: char(p, 'S'),
    ap: char(p, 'AP'),
    damage: char(p, 'D'),
    keywords: kw && kw !== '-' ? kw.split(',').map((s) => s.trim()) : [],
  };
}

/** All weapon profiles reachable under an entry (its own, its upgrades', its links'). */
function weaponsUnder(index: DataIndex, entry: RawEntry, out: Map<string, WeaponProfile>, depth = 0): void {
  if (depth > 6) return;
  entry.profiles?.forEach((p) => {
    const w = toWeapon(p);
    if (w) out.set(w.id, w);
  });
  childrenOf(index, entry).forEach((c) => {
    if (c.type === 'model' || c.type === 'unit') return; // never descend into another model
    weaponsUnder(index, c, out, depth + 1);
  });
}

/**
 * Model loadouts of a unit, taken from its model entries. Groups (e.g. "Initiates")
 * become the bracket label. This reads the default/fixed wargear only; option
 * swapping comes with the full selection engine.
 */
export function unitLoadouts(index: DataIndex, unit: RawEntry): { loadouts: ModelLoadout[]; weapons: Map<string, WeaponProfile> } {
  const loadouts: ModelLoadout[] = [];
  const weapons = new Map<string, WeaponProfile>();

  const visit = (node: RawEntry, groupLabel: string, depth: number) => {
    if (depth > 6) return;
    childrenOf(index, node).forEach((child) => {
      if (child.type === 'model') {
        const own = new Map<string, WeaponProfile>();
        weaponsUnder(index, child, own);
        own.forEach((w, id) => weapons.set(id, w));
        loadouts.push({ key: child.id, name: child.name, group: groupLabel || child.name, weaponIds: [...own.keys()] });
      } else if (!child.type) {
        visit(child, child.name, depth + 1); // a selectionEntryGroup such as "Initiates"
      }
    });
  };
  visit(unit, '', 0);
  return { loadouts, weapons };
}
