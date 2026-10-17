import { describe, expect, it } from 'vitest';
import { abilityKind } from '../rules/abilityKind';

describe('ability kinds', () => {
  it('sorts abilities by what they do', () => {
    expect(abilityKind('Righteous Zeal', 'Each time a model in this unit makes a melee attack, re-roll a Wound roll of 1.')).toBe('offence');
    expect(abilityKind('Omni-scramblers', 'In your Shooting phase, select one visible enemy unit within 18" of this unit. Until the start of your next turn, that enemy unit cannot use Deep Strike.')).toBe('debuff');
    expect(abilityKind('Armour of Faith', 'Each time an attack targets this unit, subtract 1 from the Wound roll.')).toBe('defence');
    expect(abilityKind('Rapid Charge', 'This unit is eligible to declare a charge in a turn in which it Advanced.')).toBe('movement');
    expect(abilityKind('Hidden Approach', 'At the start of the first battle round, this unit can make a Scout move of up to 6".')).toBe('deployment');
    expect(abilityKind('Blessing of the Omnissiah', 'In your Command phase, you can select one friendly Adeptus Astartes Vehicle model within 3" of this model. That model regains up to D3 lost wounds.')).toBe('support');
    expect(abilityKind('Hold the Line', 'While this unit is within range of an objective marker you control, add 1 to the OC characteristic of models in this unit.')).toBe('objective');
    expect(abilityKind('Tactical Precision', 'Once per battle round, you can target this unit with a Stratagem for 0CP.')).toBe('resource');
    expect(abilityKind('Shock Assault', 'Each time a model in this unit targets an enemy unit with a melee attack, re-roll a Wound roll of 1. If that enemy unit is within range of an objective marker, you can re-roll the Wound roll instead.')).toBe('offence');
    expect(abilityKind('Leader', 'This model can be attached to the following units: Crusader Squad')).toBe('support');
  });
});
