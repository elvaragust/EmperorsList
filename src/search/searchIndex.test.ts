import { describe, expect, it } from 'vitest';
import { createSearch, type SearchDoc } from './searchIndex';

const docs: SearchDoc[] = [
  { id: '1', kind: 'core', name: 'Critical Hit', text: 'An unmodified hit roll of 6. Lethal Hits triggers on it.', source: 'Core' },
  { id: '2', kind: 'ability', name: 'Tactical Precision', text: 'Weapons in the led unit have Lethal Hits.', source: 'Lieutenant' },
  { id: '3', kind: 'weaponAbility', name: 'Lethal Hits', text: 'A critical hit wounds automatically.', source: 'Core' },
  { id: '4', kind: 'stratagem', name: 'Lethal Volley', text: 'Made-up stratagem for the test.', source: 'Test' },
];

describe('search ranking', () => {
  const search = createSearch(docs);

  it('puts the exact name first, then starts-with, then text mentions', () => {
    const hits = search('lethal hits');
    expect(hits[0]).toMatchObject({ name: 'Lethal Hits', match: 'exact' });
    expect(hits.slice(1).map((h) => h.match)).not.toContain('exact');
  });

  it('ranks names starting with the query above body-text hits', () => {
    const hits = search('lethal');
    expect(hits.slice(0, 2).map((h) => h.name).sort()).toEqual(['Lethal Hits', 'Lethal Volley']);
    expect(hits.at(-1)!.match).toBe('text');
  });

  it('filters by rule kind', () => {
    expect(search('lethal', ['stratagem']).map((h) => h.name)).toEqual(['Lethal Volley']);
  });

  it('tolerates small typos in names', () => {
    expect(search('tactcal')[0]?.name).toBe('Tactical Precision');
  });
});
