/**
 * The whole text import (importListText) against the real BSData files, with
 * the download and database layers swapped for the local data cache. Skipped
 * when the files aren't downloaded — see realData.test.ts.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildIndex, type DataIndex } from '../bsdata/index';
import type { RawFile } from '../bsdata/raw';
import { RosterEngine, rootOptions } from '../rules/rosterEngine';
import { configChoices, setBattleSize, setDetachments, setDisposition, showOptions } from '../rules/config';
import { newUnit } from '../rules/edit';
import { exportText, matchUnitChoice, parseListText } from '../listText';
import type { Roster } from '../types';
import type { FactionFile } from '@/data/dataPacks';

const dir = resolve(process.env.EL_DATA ?? join(__dirname, '../../../../data-cache'));
const have = existsSync(join(dir, 'Imperium - Black Templars.json'));

const state = vi.hoisted(() => ({ index: undefined as unknown as DataIndex, catalogueId: '', n: 0 }));
vi.mock('@/data/dataPacks', () => ({ ensureFaction: async () => ({ catalogueId: state.catalogueId, commit: 'test', name: 'Imperium - Black Templars' }) }));
vi.mock('@/data/gameData', () => ({ loadIndex: async () => state.index, rootsFor: (i: DataIndex, c: string) => rootOptions(i, c) }));
vi.mock('@/data/rosters', () => ({ uid: () => `id${state.n++}` }));

function load(): DataIndex {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RawFile);
  return buildIndex(files);
}

const BT = { path: 'bt', name: 'Black Templars', group: 'Imperium' } as unknown as FactionFile;

describe('unit name matching', () => {
  const c = (name: string) => ({ name, root: { node: { name } } });
  const choices = [c('Land Raider'), c('Land Raider Crusader'), c('Intercessor Squad'), c('Marshal')];
  it('takes exact names and plurals as they are', () => {
    expect(matchUnitChoice(choices, 'Land Raider Crusader')).toEqual({ choice: choices[1], exact: true });
    expect(matchUnitChoice(choices, 'Marshals')).toEqual({ choice: choices[3], exact: true });
  });
  it('accepts a shorter or longer name when only noise words differ', () => {
    expect(matchUnitChoice(choices, 'Intercessor')).toEqual({ choice: choices[2], exact: true });
    expect(matchUnitChoice(choices, 'Marshal unit')).toEqual({ choice: choices[3], exact: true });
  });
  it('marks a typo that only shares the start of a name as a guess', () => {
    expect(matchUnitChoice(choices, 'Land Raider Crusador')).toEqual({ choice: choices[0], exact: false });
    expect(matchUnitChoice(choices, 'Marshalling Yard')).toBeUndefined();
  });
});

describe('battle size line', () => {
  it('reads "Custom (1500 points)" as the battle size, not a unit', () => {
    const p = parseListText(`My list (1480 points)\n\nBlack Templars\nCustom (1500 points)\nGladius Task Force\nForce Disposition: Purge the Foe\n\nCHARACTERS\n\nMarshal (80 points)\n  • Warlord\n`);
    expect(p.battleSize).toBe('custom');
    expect(p.pointsLimit).toBe(1500);
    expect(p.detachments).toEqual(['Gladius Task Force']);
    expect(p.disposition).toBe('Purge the Foe');
    expect(p.units.map((u) => u.name)).toEqual(['Marshal']);
  });
  it('keeps the limit of a named battle size', () => {
    const p = parseListText(`My list (980 points)\n\nBlack Templars\nIncursion (1,000 points)\n`);
    expect(p.battleSize).toBe('incursion');
    expect(p.pointsLimit).toBe(1000);
  });
});

describe.skipIf(!have)('text import (real data)', () => {
  if (have) {
    state.index = load();
    state.catalogueId = [...state.index.catalogues.values()].find((c) => /Black Templars/.test(c.name))!.id;
  }
  const roots = () => rootOptions(state.index, state.catalogueId);
  const run = async (text: string) => (await import('@/data/importList')).importListText(text, BT);

  it('imports allied units by turning on the data switch that shows them', async () => {
    const text = `Allies (2000 points)

Black Templars
Strike Force (2000 points)
Gladius Task Force

CHARACTERS

Marshal (80 points)
  • Warlord

ALLIED UNITS

Inquisitor Coteaz (60 points)
Armiger Warglaive (140 points)
`;
    const { roster, report } = await run(text);
    const e = new RosterEngine(state.index, roster, roots());
    expect(report.unmatched.filter((u) => /^Unit:/.test(u))).toEqual([]);
    expect(roster.units.map((u) => e.unitName(u.id))).toEqual(expect.arrayContaining(['Inquisitor Coteaz', 'Armiger Warglaive']));
    const on = showOptions(e).filter((o) => o.on).map((o) => o.name);
    expect(on.some((n) => /agents/i.test(n))).toBe(true);
    expect(on.some((n) => /knights/i.test(n))).toBe(true);
    expect(e.issues().filter((i) => /not allowed/.test(i.title))).toEqual([]);
  });

  it('flags a misspelt datasheet instead of quietly importing a different one', async () => {
    const text = `Typo (2000 points)

Black Templars
Strike Force (2000 points)
Gladius Task Force

OTHER DATASHEETS

Land Raider Crusador (1 points)
`;
    const { roster, report } = await run(text);
    expect(roster.units).toHaveLength(1);
    expect(report.unmatched).toContain('Unit: matched Land Raider Crusador to Land Raider — check');
    // The points note doesn't blame the data for a unit that may be the wrong one.
    const notes = report.notes ?? [];
    expect(notes[0]).toBe('Points differ from your list:');
    expect(notes.join('\n')).toMatch(/Land Raider Crusador: \d+ pts here, 1 in your list — not every line matched, check this unit/);
  });

  it('reads its own export of a custom points list back with the same header', async () => {
    const eng = (r: Roster) => new RosterEngine(state.index, r, roots());
    let r: Roster = { id: 'r', name: 'Custom list', gameSystemId: '', catalogueId: state.catalogueId, factionName: 'Black Templars', battleSize: 'strikeForce', pointsLimit: 2000, config: [], detachmentIds: [], units: [], createdAt: 0, updatedAt: 0 };
    r = setBattleSize(eng(r), r, 'custom', 1500);
    const ch = configChoices(eng(r));
    const det = ch.detachments.filter((d) => !d.hidden)[1]!;
    r = setDetachments(eng(r), r, [det.key]);
    const disp = configChoices(eng(r)).dispositions.filter((d) => !d.hidden).at(-1)!;
    r = setDisposition(eng(r), r, disp.key);
    r = { ...r, units: [newUnit(eng(r), roots().find((x) => x.node.name === 'Marshal')!.key)] };
    const text = exportText(eng(r), r);
    expect(text).toMatch(/^Custom \(1500 points\)$/m);
    const { roster, report } = await run(text);
    expect(roster.battleSize).toBe('custom');
    expect(new RosterEngine(state.index, roster, roots()).pointsLimit()).toBe(1500);
    expect(roster.detachmentNames).toEqual(r.detachmentNames);
    expect(roster.forceDisposition).toBe(r.forceDisposition);
    expect(roster.units).toHaveLength(1);
    expect(report.unmatched).toEqual([]);
  });
});
