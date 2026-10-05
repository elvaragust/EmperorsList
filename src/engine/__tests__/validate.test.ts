import { describe, expect, it } from 'vitest';
import { validateRoster } from '../validate';
import type { Roster, RosterUnit } from '../types';

const unit = (id: string, entryId: string, points: number, extra: Partial<RosterUnit> = {}): RosterUnit => ({
  id,
  entryId,
  name: entryId,
  points,
  primaryCategory: 'Other',
  models: [],
  selections: [],
  ...extra,
});

const roster = (units: RosterUnit[], detachmentIds = ['d2']): Roster => ({
  id: 'r',
  name: 'Test',
  gameSystemId: 'g',
  catalogueId: 'c',
  factionName: 'Test',
  battleSize: 'strikeForce',
  pointsLimit: 2000,
  detachmentIds,
  units,
  createdAt: 0,
  updatedAt: 0,
});

const cost = (id: string) => (id === 'd2' ? 2 : 1);

describe('validateRoster', () => {
  it('passes a legal list', () => {
    expect(validateRoster(roster([unit('a', 'Captain', 90, { isWarlord: true })]), cost)).toEqual([]);
  });

  it('explains points over the limit', () => {
    const issues = validateRoster(roster([unit('a', 'Big', 2070, { isWarlord: true })]), cost);
    expect(issues[0]).toMatchObject({ title: '70 pts over the limit', fix: 'Show units by cost' });
  });

  it('allows double copies of Battleline but not other datasheets', () => {
    const bl = [1, 2, 3, 4, 5, 6].map((i) => unit(`b${i}`, 'Squad', 10, { primaryCategory: 'Battleline' }));
    const other = [1, 2, 3, 4].map((i) => unit(`o${i}`, 'Tank', 10));
    const issues = validateRoster(roster([unit('w', 'Captain', 90, { isWarlord: true }), ...bl, ...other]), cost);
    expect(issues.map((i) => i.title)).toEqual(['Tank × 4']);
    expect(issues[0]!.why).toContain('allows 3 copies of a non-Battleline datasheet');
  });

  it('flags too many Detachment Points and a missing Warlord', () => {
    const issues = validateRoster(roster([unit('a', 'Captain', 90)], ['d2', 'd2']), cost);
    expect(issues.map((i) => i.title)).toEqual(['4 of 3 Detachment Points', 'No Warlord chosen']);
  });
});
