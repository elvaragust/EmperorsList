import { describe, expect, it } from 'vitest';
import { rulesForUnit } from '../../screens/play/detachmentRules';

const rule = (name: string, text: string) => ({ detachment: 'Test', name, text, wp: true });
const rules = [
  rule('Faith-fuelled Resolve', 'Each time an attack targets a SWORD BRETHREN unit from your army, subtract 1 from the Wound roll.'),
  rule('Armoured Wrath', 'Each time a ^^**Vehicle**^^ model from your army makes an attack, re-roll a Hit roll of 1.'),
  rule('Zeal', 'ADEPTUS ASTARTES units from your army can re-roll Charge rolls. WHEN: Your Charge phase.'),
];
const known = new Set(['SWORD BRETHREN', 'VEHICLE', 'INFANTRY', 'ADEPTUS ASTARTES', 'BLACK TEMPLARS']);
const faction = ['Adeptus Astartes', 'Black Templars'];

describe('detachment rules on unit cards', () => {
  it('gives each unit the rules naming its keywords, plus army-wide ones', () => {
    expect(rulesForUnit(rules, ['Infantry', 'Sword Brethren'], faction, known).map((r) => r.name)).toEqual(['Faith-fuelled Resolve', 'Zeal']);
    expect(rulesForUnit(rules, ['Vehicle'], faction, known).map((r) => r.name)).toEqual(['Armoured Wrath', 'Zeal']);
    expect(rulesForUnit(rules, ['Infantry'], faction, known).map((r) => r.name)).toEqual(['Zeal']);
  });
});
