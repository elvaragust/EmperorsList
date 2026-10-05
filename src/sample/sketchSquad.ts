import type { ModelInstance, ModelLoadout, WeaponProfile } from '@/engine/types';

/**
 * Demo data that mirrors Elvar's paper sketch of the unit grid. It is NOT game
 * data: names are the sketch's own abbreviations and the numbers are the
 * attacks written on the sketch. Real units come from the downloaded data pack.
 */
const w = (id: string, short: string, name: string, melee: boolean, attacks: string): WeaponProfile => ({
  id,
  short,
  name,
  melee,
  attacks,
  range: melee ? 'Melee' : '—',
  skill: '—',
  strength: '—',
  ap: '—',
  damage: '—',
  keywords: [],
});

export const sketchWeapons = new Map<string, WeaponProfile>(
  [
    w('hbp', 'HBP', 'Heavy bolt pistol', false, '1'),
    w('bp', 'BP', 'Bolt pistol', false, '1'),
    w('mc', 'MC', 'Master-crafted weapon', true, '3'),
    w('cc', 'CC', 'Close combat weapon', true, '3'),
    w('ic', 'IC', 'Initiate weapon', true, '4'),
    w('pf', 'PF', 'Power fist', true, '3'),
    w('nc', 'NC', 'Neophyte weapon', true, '4'),
  ].map((x) => [x.id, x]),
);

export const sketchLoadouts: ModelLoadout[] = [
  { key: 'sb', name: 'Sword Brother', group: 'Sword Brother', weaponIds: ['hbp', 'mc'] },
  { key: 'ic', name: 'Initiate', group: 'Initiates', weaponIds: ['hbp', 'bp', 'cc', 'ic'] },
  { key: 'ip', name: 'Initiate · fist', group: 'Initiates', weaponIds: ['hbp', 'bp', 'cc', 'pf'] },
  { key: 'ne', name: 'Neophyte', group: 'Neophytes', weaponIds: ['bp', 'nc'] },
];

export function sketchModels(): ModelInstance[] {
  const out: ModelInstance[] = [];
  const add = (key: string, n: number) => {
    for (let i = 0; i < n; i++) out.push({ id: `${key}-${i + 1}`, loadoutKey: key, alive: true });
  };
  add('sb', 1);
  add('ic', 3);
  add('ip', 2);
  add('ne', 4);
  return out;
}
