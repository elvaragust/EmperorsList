import { describe, expect, it } from 'vitest';
import { abilityKind } from '../rules/abilityKind';

describe('ability colours', () => {
  it('sorts abilities by what they do', () => {
    expect(abilityKind('Righteous Zeal', 'Each time a model in this unit makes a melee attack, re-roll a Wound roll of 1.')).toBe('attack');
    expect(abilityKind('Omni-scramblers', 'In your Shooting phase, select one visible enemy unit within 18" of this unit. Until the start of your next turn, that enemy unit cannot use Deep Strike.')).toBe('debuff');
    expect(abilityKind('Armour of Faith', 'Each time an attack targets this unit, subtract 1 from the Wound roll.')).toBe('defence');
    expect(abilityKind('Rapid Deployment', 'This unit is eligible to declare a charge in a turn in which it Advanced.')).toBe('move');
    expect(abilityKind('Leader', 'This model can be attached to the following units: Crusader Squad')).toBe('utility');
  });
});
