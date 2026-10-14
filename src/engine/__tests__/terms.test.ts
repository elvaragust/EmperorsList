import { describe, expect, it } from 'vitest';
import { buildIndex } from '../bsdata/index';
import { exactTerm, setCoreSections, termMatcher } from '../rules/glossary';

describe('tappable terms', () => {
  it('links the combined rule instead of its pieces, singular or plural', () => {
    const index = buildIndex([]);
    setCoreSections([
      { num: 'Movement Ability', title: 'Assault Disembark Move', text: 'ELIGIBLE IF: …' },
      { num: '21.02', title: 'Surge Moves', text: 'A surge move is…' },
    ]);
    const text = 'units embarked within this unit can make an assault disembark move (pg 157), or surge move.';
    const re = termMatcher(index).re!;
    const found = [...text.matchAll(re)].map((m) => m[0]);
    expect(found).toEqual(['assault disembark move', 'surge move']);
    expect(exactTerm(index, 'Assault Disembark moves')).toBe('Assault Disembark Move');
    expect(exactTerm(index, 'Assault Disembark')).toBeUndefined();
  });
});
