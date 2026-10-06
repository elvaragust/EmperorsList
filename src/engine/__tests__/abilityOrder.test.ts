import { describe, expect, it } from 'vitest';
import { orderAbilities } from '../rules/models';

describe('ability order', () => {
  it('puts Support after the unit abilities and before Leader', () => {
    const names = orderAbilities([{ name: 'Support' }, { name: 'Leader' }, { name: 'Vehement Aggression' }, { name: 'Oath' }]).map((a) => a.name);
    expect(names).toEqual(['Vehement Aggression', 'Oath', 'Support', 'Leader']);
  });
  it('keeps Support last when there is no Leader', () => {
    expect(orderAbilities([{ name: 'Support' }, { name: 'A' }]).map((a) => a.name)).toEqual(['A', 'Support']);
  });
});
