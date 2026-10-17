import { describe, expect, it } from 'vitest';
import { protections } from '../rules/protections';

const ab = (name: string, text: string) => ({ id: name, name, typeName: 'Abilities', characteristics: [{ name: 'Description', $text: text }] }) as never;

describe('saves summary', () => {
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
