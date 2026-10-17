import { describe, expect, it } from 'vitest';
import { protections } from '../rules/protections';

const ab = (name: string, text: string) => ({ id: name, name, typeName: 'Abilities', characteristics: [{ name: 'Description', $text: text }] }) as never;

describe('saves summary', () => {
  it("reads the stat line's InSv, with the starred ability saying what it's against", () => {
    const stat = (name: string, inv: string) => ({ id: name, name, typeName: 'Unit', characteristics: [{ name: 'M', $text: '6"' }, { name: 'InSv', $text: inv }] }) as never;
    const p = protections([
      { name: 'Crusader Squad', own: true, abilities: [], rules: [], stats: [stat('Initiate', ''), stat('Sword Brother', '4+')] },
      { name: 'Judiciar', own: false, abilities: [ab('*Invulnerable Save', 'This model has a 4+ invulnerable save against melee attacks.')], rules: [], stats: [stat('Judiciar', '4+*')] },
    ]);
    expect(p).toEqual([
      { kind: 'Invulnerable save', value: '4+', against: undefined, only: 'Sword Brother' },
      { kind: 'Invulnerable save', value: '4+', against: 'melee attacks', only: 'Judiciar' },
    ]);
  });

  it('reads invulnerable saves and Feel No Pain, with what they apply to', () => {
    const p = protections([
      { name: 'Sword Brethren', own: true, abilities: [ab('Invulnerable Save (5+*)', 'This model has a 5+ invulnerable save against ranged attacks.')], rules: [] },
      { name: 'Judiciar', own: false, abilities: [ab('Invulnerable Save', '4+')], rules: [{ name: 'Feel No Pain 6+' } as never] },
      { name: 'Apothecary', own: false, abilities: [ab('Narthecium', 'While this model is leading a unit, models in that unit have the Feel No Pain 5+ ability against mortal wounds.')], rules: [] },
    ]);
    expect(p).toEqual([
      { kind: 'Invulnerable save', value: '5+', against: 'ranged attacks', only: undefined },
      { kind: 'Invulnerable save', value: '4+', against: undefined, only: 'Judiciar' },
      { kind: 'Feel No Pain', value: '6+', only: 'Judiciar' },
      { kind: 'Feel No Pain', value: '5+', against: 'mortal wounds', only: undefined },
    ]);
  });
});
