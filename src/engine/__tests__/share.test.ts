import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, type DataIndex } from '../bsdata/index';
import type { RawFile } from '../bsdata/raw';
import { fromPayload, toPayload, type SharePayload } from '../share';
import { RosterEngine, rootOptions } from '../rules/rosterEngine';
import { chosenDetachmentKeys, configChoices, setBattleSize, setDetachments, syncDetachments } from '../rules/config';
import { detachmentRules } from '../rules/armyRules';
import type { Roster } from '../types';

const roster: Roster = {
  id: 'a', name: 'L', gameSystemId: '', catalogueId: 'cat', factionName: 'BT', battleSize: 'strikeForce', pointsLimit: 2000,
  config: [{ entryId: 'det', count: 1, children: [{ entryId: 'gladius', count: 1, children: [] }] }],
  detachmentIds: ['gladius'],
  detachmentNames: ['Gladius Task Force'],
  units: [
    { id: 'u1', entryId: 'sq', name: 'Squad', points: 150, primaryCategory: '', selections: [], weaponNotes: { w1: '+1 attack' } },
    { id: 'u2', entryId: 'ch', name: 'Char', points: 80, primaryCategory: '', selections: [], leaderOf: 'u1', leaderForced: true },
  ],
  createdAt: 0, updatedAt: 0,
};

describe('share payload', () => {
  it('carries detachment ids, hand-made attachments and weapon notes', () => {
    let n = 0;
    const back = fromPayload(JSON.parse(JSON.stringify(toPayload(roster))), () => `id${n++}`);
    expect(back.detachmentIds).toEqual(['gladius']);
    expect(back.detachmentNames).toEqual(['Gladius Task Force']);
    expect(back.units[1]!.leaderOf).toBe(back.units[0]!.id);
    expect(back.units[1]!.leaderForced).toBe(true);
    expect(back.units[0]!.leaderForced).toBeUndefined();
    expect(back.units[0]!.weaponNotes).toEqual({ w1: '+1 attack' });
  });

  it('still opens links made before those were added', () => {
    const old: SharePayload = { v: 1, c: 'cat', n: 'L', fn: 'BT', b: 'strikeForce', p: 2000, g: roster.config.map((s) => [s.entryId, s.count, s.children.map((c) => [c.entryId, c.count] as [string, number])]), u: [['sq', []], ['ch', [], '0', 'Bob']], dn: ['Gladius Task Force'] };
    let n = 0;
    const back = fromPayload(JSON.parse(JSON.stringify(old)), () => `id${n++}`);
    expect(back.detachmentIds).toEqual([]);
    expect(back.units[1]!.leaderOf).toBe(back.units[0]!.id);
    expect(back.units[1]!.nickname).toBe('Bob');
    expect(back.units[1]!.leaderForced).toBeUndefined();
    expect(back.config).toEqual(roster.config);
  });
});

const dir = resolve(process.env.EL_DATA ?? join(__dirname, '../../../../data-cache'));
const have = existsSync(join(dir, 'Imperium - Black Templars.json'));

describe.skipIf(!have)('share link detachments (real data)', () => {
  it('rebuilds the detachments of a list from an older link', () => {
    const index: DataIndex = buildIndex(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RawFile));
    const cat = [...index.catalogues.values()].find((c) => /Black Templars/.test(c.name))!.id;
    const roots = rootOptions(index, cat);
    const eng = (r: Roster) => new RosterEngine(index, r, roots);
    let r: Roster = { ...roster, catalogueId: cat, config: [], detachmentIds: [], detachmentNames: [], units: [] };
    r = setBattleSize(eng(r), r, 'strikeForce');
    const dets = configChoices(eng(r)).detachments.filter((d) => !d.hidden && d.dp === 1);
    r = setDetachments(eng(r), r, [dets[0]!.key]);
    // A link from before detachment ids were sent.
    const { di: _, ...old } = toPayload(r);
    const got = fromPayload(JSON.parse(JSON.stringify(old)) as SharePayload, () => 'x');
    expect(got.detachmentIds).toEqual([]);
    const e = eng(got);
    // Read from the config even before it is saved again...
    expect(chosenDetachmentKeys(e)).toEqual([dets[0]!.key]);
    expect(detachmentRules(e).length).toBeGreaterThan(0);
    // ...and cached once it is.
    const synced = syncDetachments(e, got);
    expect(synced.detachmentIds).toEqual([dets[0]!.key]);
    expect(synced.detachmentNames).toEqual([dets[0]!.name]);
    // Ticking a second detachment adds to the first instead of replacing it.
    const both = setDetachments(e, got, [...chosenDetachmentKeys(e), dets[1]!.key]);
    expect(both.detachmentIds).toEqual([dets[0]!.key, dets[1]!.key]);
  });
});
