import { describe, expect, it } from 'vitest';
import { nextPhase, previousPhase, abilityInPhase } from '../game';
import { parseListText } from '../listText';
import { fromPayload, toPayload } from '../share';
import { importWahapedia, parsePipeCsv, stratagemFits, stratagemsFor } from '../wahapedia';
import { baseRuleName } from '../rules/glossary';
import { shortCode } from '../loadouts';
import type { Roster } from '../types';

describe('turn order', () => {
  it('runs phases, swaps turns, then rounds, and ends after round 5', () => {
    let s = { round: 1, turn: 'me' as const, phase: 'fight' as const };
    const n = nextPhase(s, 'me');
    expect(n).toMatchObject({ round: 1, turn: 'them', phase: 'command', cpGain: true });
    const m = nextPhase({ round: 1, turn: 'them', phase: 'fight' }, 'me');
    expect(m).toMatchObject({ round: 2, turn: 'me', phase: 'command' });
    expect(nextPhase({ round: 5, turn: 'them', phase: 'fight' }, 'me').gameOver).toBe(true);
    expect(previousPhase({ round: 2, turn: 'me', phase: 'command' }, 'me')).toEqual({ round: 1, turn: 'them', phase: 'fight' });
    s = { round: 1, turn: 'me', phase: 'fight' };
    expect(nextPhase({ ...s, phase: 'command' } as never, 'me')).toMatchObject({ phase: 'movement', cpGain: false });
  });
  it('spots phase words in abilities', () => {
    expect(abilityInPhase('At the start of your Command phase, ...', 'command')).toBe(true);
    expect(abilityInPhase('Each time this model makes a melee attack', 'fight')).toBe(true);
    expect(abilityInPhase('Once per battle', 'shooting')).toBe(false);
  });
});

describe('official app text', () => {
  const text = `Crusade Hammer (1000 points)

Black Templars
Incursion (1000 points)
Wrathful Procession
Force Disposition: Take and Hold

CHARACTERS

Marshal (80 points)
  • Warlord
  • 1x Master-crafted power weapon
  • Enhancement: Benediction of Fury

BATTLELINE

Crusader Squad (150 points)
  • 1x Sword Brother
    ◦ 1x Heavy Bolt Pistol
    ◦ 1x Master-crafted Power Weapon
  • 5x Initiate w/Bolt Rifle
  • 4x Neophyte w/ Astartes Chainsword

Exported with App Version: v1.0`;
  it('parses header, units and nested wargear', () => {
    const p = parseListText(text);
    expect(p.title).toBe('Crusade Hammer');
    expect(p.points).toBe(1000);
    expect(p.faction).toBe('Black Templars');
    expect(p.battleSize).toBe('incursion');
    expect(p.detachments).toEqual(['Wrathful Procession']);
    expect(p.disposition).toBe('Take and Hold');
    expect(p.units.map((u) => u.name)).toEqual(['Marshal', 'Crusader Squad']);
    expect(p.units[0]!.lines.map((l) => l.kind)).toEqual(['warlord', 'item', 'enhancement']);
    expect(p.units[1]!.lines.filter((l) => l.depth === 2).map((l) => l.name)).toEqual(['Heavy Bolt Pistol', 'Master-crafted Power Weapon']);
    expect(p.units[1]!.lines[3]).toMatchObject({ depth: 1, count: 5, name: 'Initiate w/Bolt Rifle' });
  });
});

describe('share payload', () => {
  it('round-trips ids, counts and leader links', () => {
    const roster: Roster = {
      id: 'a', name: 'L', gameSystemId: '', catalogueId: 'cat', factionName: 'BT', battleSize: 'strikeForce', pointsLimit: 2000,
      config: [{ entryId: 'bs', count: 1, children: [{ entryId: 'sf', count: 1, children: [] }] }], detachmentIds: [],
      units: [
        { id: 'u1', entryId: 'sq', name: 'Squad', points: 150, primaryCategory: '', selections: [{ entryId: 'm', count: 5, children: [] }] },
        { id: 'u2', entryId: 'ch', name: 'Char', points: 80, primaryCategory: '', selections: [], leaderOf: 'u1', nickname: 'Bob' },
      ],
      createdAt: 0, updatedAt: 0,
    };
    let n = 0;
    const back = fromPayload(JSON.parse(JSON.stringify(toPayload(roster, 'x.json'))), () => `id${n++}`);
    expect(back.config).toEqual(roster.config);
    expect(back.units[0]!.selections).toEqual(roster.units[0]!.selections);
    expect(back.units[1]!.leaderOf).toBe(back.units[0]!.id);
    expect(back.units[1]!.nickname).toBe('Bob');
  });
});

describe('Wahapedia import', () => {
  const factions = 'id|name|link|\nSM|Space Marines|x|\n';
  const strats =
    'faction_id|name|id|type|cp_cost|legend|turn|phase|detachment|detachment_id|description|\n' +
    'SM|ARMOUR OF CONTEMPT|1|Battle Tactic Stratagem|1|leg|Either player’s turn|Shooting or Fight phase|Gladius Task Force|9|<b>WHEN:</b> Your opponent’s Shooting phase.<br>Effect|\n' +
    '|COMMAND RE-ROLL|2|Core – Strategic Ploy Stratagem|1||Either player’s turn|Any phase|||Re-roll one roll.|\n';
  it('parses pipe CSV and keeps bold', () => {
    expect(parsePipeCsv(factions)).toEqual([{ id: 'SM', name: 'Space Marines', link: 'x' }]);
    const rules = importWahapedia({ factions, stratagems: strats });
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ name: 'Armour Of Contempt', faction: 'Space Marines', cp: '1', detachment: 'Gladius Task Force' });
    expect(rules[0]!.text).toContain('**WHEN:**');
    const forArmy = stratagemsFor(rules, ['Gladius Task Force'], ['Space Marines']);
    expect(forArmy).toHaveLength(2);
    expect(stratagemFits(rules[0]!, 'shooting', 'them')).toBe(true);
    expect(stratagemFits(rules[0]!, 'charge', 'me')).toBe(false);
    expect(stratagemFits(rules[1]!, 'charge', 'me')).toBe(true);
  });
});

describe('names', () => {
  it('finds the base rule of parameterised abilities', () => {
    expect(baseRuleName('Sustained Hits 1')).toBe('sustained hits');
    expect(baseRuleName('Anti-Infantry 4+')).toBe('anti');
    expect(baseRuleName('Rapid Fire 2')).toBe('rapid fire');
    expect(baseRuleName('[LETHAL HITS]')).toBe('lethal hits');
  });
  it('gives weapon modes their own column codes', () => {
    expect(shortCode('➤ Plasma pistol - standard')).toBe('PP-ST');
    expect(shortCode('➤ Plasma pistol - supercharge')).toBe('PP-SU');
  });
});
