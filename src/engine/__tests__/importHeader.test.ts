import { describe, expect, it } from 'vitest';
import { headerParts, matchConfig, matchFaction, parseListText } from '../listText';
import { drawTactical, discardTactical, newTactical, ownPrimaries, scoreTactical, secondariesFor } from '../missions';

const TEXT = `Templars (1,005 Points)

Space Marines
Black Templars
Strike Force (2,000 Points)
Companions of Vehemence (1 DP) + Gladius Task Force
Force Disposition: Purge the Foe

BATTLELINE

Assault Intercessor Squad (75 Points)
  • 4x Assault Intercessors
`;

describe('list header import', () => {
  const parsed = parseListText(TEXT);
  it('reads titles and points with thousands separators', () => {
    expect(parsed.title).toBe('Templars');
    expect(parsed.points).toBe(1005);
    expect(parsed.battleSize).toBe('strikeForce');
    expect(parsed.units[0]?.points).toBe(75);
  });
  it('splits header lines into names', () => {
    expect(headerParts('Detachment: Companions of Vehemence (1 DP) + Gladius Task Force')).toEqual(['Companions of Vehemence', 'Gladius Task Force']);
  });
  it('picks the most specific faction', () => {
    expect(matchFaction(parsed, [{ name: 'Space Marines' }, { name: 'Black Templars' }])?.name).toBe('Black Templars');
  });
  it('finds detachments and the disposition wherever they are', () => {
    const cfg = matchConfig(parsed, {
      detachments: [
        { key: 'c', name: 'Companions of Vehemence' },
        { key: 'g', name: 'Gladius Task Force' },
      ],
      dispositions: [{ key: 'p', name: 'Purge the Foe' }],
    });
    expect(cfg.detachments.map((d) => d.key)).toEqual(['c', 'g']);
    expect(cfg.disposition?.key).toBe('p');
  });
});

describe('missions', () => {
  it('primaries come from your own disposition', () => {
    expect(ownPrimaries('Take and Hold')).toContain('Battlefield Dominance');
    expect(ownPrimaries('Take and Hold')).not.toContain('Meatgrinder');
    expect(ownPrimaries(undefined)).toEqual([]);
  });
  it('tactical deck draws two, keeps unscored cards, scores and discards', () => {
    let t = newTactical(['A', 'B', 'C', 'D']);
    t = drawTactical(t, 2);
    expect(t.active).toHaveLength(2);
    t = drawTactical(t, 2);
    expect(t.active).toHaveLength(4);
    const [a, b] = t.active;
    t = scoreTactical(t, a!, 1);
    t = discardTactical(t, b!);
    expect(t.active).toHaveLength(2);
    expect(t.scored).toEqual([{ name: a, round: 1 }]);
    // deck empty: discards are reshuffled in
    t = drawTactical(t, 1);
    expect(t.active).toContain(b);
  });
  it('drops cards tagged only for the other role', () => {
    const tags = new Map([['No Prisoners', ['attacker']], ['Plunder', ['defender']], ['Beacon', ['attacker', 'defender']]]);
    const atk = secondariesFor('attacker', tags);
    expect(atk).toContain('No Prisoners');
    expect(atk).not.toContain('Plunder');
    expect(atk).toContain('Beacon');
  });
});

describe('lists without a header', () => {
  it('treats the first line as a unit when bullets follow it', () => {
    const p = parseListText('Necron Warriors (90 Points)\n  • 10x Necron Warrior\nImmortals (75 Points)\n  • 5x Immortal\n');
    expect(p.units.map((u) => u.name)).toEqual(['Necron Warriors', 'Immortals']);
    expect(p.title).toBeUndefined();
  });
});

describe('official app export (attached units, one bullet per group)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const text = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/official-app-export.txt'), 'utf8') as string;
  const p = parseListText(text);
  it('finds every unit and nothing else', () => {
    expect(p.units.map((u) => u.name)).toEqual([
      "Emperor's Champion",
      'Assault Intercessor Squad',
      'High Marshal Helbrecht',
      'Crusader Squad',
      'Chaplain on Bike',
      'Outrider Squad',
      'Techmarine',
      'Land Raider Redeemer',
      'Sword Brethren Squad',
    ]);
  });
  it('pairs leaders with bodyguards', () => {
    expect(p.units.slice(0, 2).map((u) => [u.attachedGroup, u.attachedRole])).toEqual([
      [1, 'leader'],
      [1, 'bodyguard'],
    ]);
    expect(p.units[6]!.attachedGroup).toBeUndefined();
  });
  it('reads un-bulleted wargear lines at the right depth', () => {
    const crusader = p.units[3]!.lines.map((l) => `${l.depth}:${l.count} ${l.name}`);
    expect(crusader).toContain('1:5 Initiate');
    expect(crusader).toContain('2:3 Initiate Chainsword');
    expect(crusader).toContain('2:2 Power Fist');
    expect(p.units[3]!.lines.find((l) => l.kind === 'enhancement')?.name).toBe('Furious Assault');
    expect(p.units[6]!.lines.map((l) => `${l.depth}:${l.name}`)).toEqual(['1:Forge Bolter', '1:Grav-pistol', '1:Omnissian Power Axe and Servo-arm']);
  });
  it('splits "A, B and C (3 Detachment Points)" and keeps names with "and"', () => {
    const cfg = matchConfig(p, {
      detachments: [
        { key: 'a', name: 'Assault Brethren' },
        { key: 'i', name: 'Ironstorm Spearhead' },
        { key: 'm', name: "Marshal's Household" },
        { key: 's', name: 'Legends of Saga and Song' },
      ],
      dispositions: [{ key: 'p', name: 'Purge the Foe' }],
    });
    expect(cfg.detachments.map((d) => d.key)).toEqual(['a', 'i', 'm']);
    expect(cfg.disposition?.key).toBe('p');
    const saga = matchConfig({ ...p, headerLines: ['Legends of Saga and Song'] }, { detachments: [{ key: 's', name: 'Legends of Saga and Song' }], dispositions: [] });
    expect(saga.detachments.map((d) => d.key)).toEqual(['s']);
  });
});
