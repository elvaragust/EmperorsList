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
