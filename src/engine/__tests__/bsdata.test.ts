import { describe, expect, it } from 'vitest';
import { buildIndex, rootUnits } from '../bsdata/index';
import { normalizeXml } from '../bsdata/normalizeXml';
import { shortCode, unitLoadouts } from '../loadouts';
import { factionFile, factionXml, libraryFile } from './fixtures';

describe('BSData loading', () => {
  it('finds root units through the faction catalogue', () => {
    const index = buildIndex([libraryFile, factionFile]);
    expect(rootUnits(index, 'cat-1').map((u) => u.name)).toEqual(['Test Squad']);
  });

  it('reads model loadouts, resolving weapons through entryLinks into the library', () => {
    const index = buildIndex([libraryFile, factionFile]);
    const unit = index.entries.get('u-squad')!;
    const { loadouts, weapons } = unitLoadouts(index, unit);
    expect(loadouts.map((l) => [l.name, l.group, l.weaponIds])).toEqual([
      ['Sergeant', 'Sergeant', ['p-blade']],
      ['Trooper', 'Troopers', ['p-pistol', 'p-blade']],
    ]);
    expect(weapons.get('p-pistol')).toMatchObject({ melee: false, attacks: '1', keywords: ['Close-quarters'] });
    expect(weapons.get('p-blade')).toMatchObject({ melee: true, attacks: '3', keywords: [] });
  });

  it('loads the XML format into the same shape as JSON', () => {
    const fromXml = normalizeXml(factionXml);
    const index = buildIndex([libraryFile, fromXml]);
    const { loadouts } = unitLoadouts(index, index.entries.get('u-squad')!);
    expect(loadouts.map((l) => l.weaponIds)).toEqual([['p-blade'], ['p-pistol', 'p-blade']]);
    expect(fromXml.catalogue?.sharedSelectionEntries?.[0]?.costs?.[0]?.value).toBe(100);
  });

  it('makes short column codes like the paper sketch', () => {
    expect(shortCode('Heavy Bolt Pistol')).toBe('HBP');
    expect(shortCode('Power fist')).toBe('PF');
    expect(shortCode('Pyreblaster')).toBe('PYR');
  });
});
