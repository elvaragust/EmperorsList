import { describe, expect, it } from 'vitest';
import { nextPhase, previousPhase, abilityInPhase } from '../game';
import { parseListText } from '../listText';
import { fromPayload, toPayload } from '../share';
import { importWahapedia, parsePipeCsv, stratagemFits, stratagemsFor } from '../wahapedia';
import { baseRuleName } from '../rules/glossary';
import { shortCode } from '../loadouts';
import type { Roster } from '../types';
import type { ImportedRule } from '../wahapedia';

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

describe('stratagems for an army', () => {
  const row = (name: string, type: string, extra: Partial<ImportedRule> = {}): ImportedRule => ({ id: name + type, kind: 'stratagem', faction: '', factionId: '', name, type, cp: '1', source: 'Wahapedia', text: '', ...extra });
  const all = [
    row('Command Re-Roll', 'Core Stratagem', { phase: 'Any phase' }),
    row('Counteroffensive', 'Core Stratagem'),
    row('Counter-Offensive', 'Core – Strategic Ploy Stratagem'),
    row('Battlefield Command', 'Boarding Actions – Strategic Ploy Stratagem'),
    row('All In', 'Challenger – Strategic Ploy Stratagem', { cp: '0' }),
    row('Normal Fight', 'Shooting Ability', { phase: 'Ability "Fight"' }),
    row('Blade of Detestation', 'Marshal’s Household Stratagem', { faction: 'Space Marines', factionId: 'SM', detachment: 'Marshal’s Household' }),
    row('Armour of Contempt', 'Gladius Task Force – Battle Tactic Stratagem', { faction: 'Space Marines', factionId: 'SM', detachment: 'Gladius Task Force' }),
  ];
  it('keeps the current core set and your detachments only', () => {
    const names = stratagemsFor(all, ["Marshal's Household"], ['Black Templars', 'Space Marines']).map((s) => s.name);
    expect(names).toEqual(['Command Re-Roll', 'Counteroffensive', 'Blade of Detestation']);
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

describe('core rules page', () => {
  it('splits numbered sections and finds terms', async () => {
    const { parseCoreRules } = await import('../coreRules');
    const { setCoreSections, findCoreSection } = await import('../rules/glossary');
    const html = `<nav>x</nav><h2>Moving 03</h2><p>Models move across the battlefield.</p>
<div><span>Advance 09.06</span></div><p>When a unit Advances, roll one D6 and add it to the Move characteristic.</p>
<h3><b>Surge Moves</b> 21.02</h3><p>Some rules let a unit make a surge move, like a Normal move.</p>`;
    const sections = parseCoreRules(html);
    expect(sections.map((s) => `${s.num} ${s.title}`)).toEqual(['03 Moving', '09.06 Advance', '21.02 Surge Moves']);
    setCoreSections(sections);
    expect(findCoreSection('surge move')?.num).toBe('21.02');
    expect(findCoreSection('Advance')?.num).toBe('09.06');
    setCoreSections([]);
  });
});

describe('core rules page with numbered headings', () => {
  it('reads every h_number heading, names moves and abilities nicely, and skips tooltip copies', async () => {
    const { parseCoreRules } = await import('../coreRules');
    const html = `<h2 id="Moving-Units">Moving Units <span class="h_number">03.01</span></h2><p>Units move in the Movement phase, one at a time.</p>
<div class="tooltip_templates"><span><div class="abName">FIGHTS FIRST<span class="h_number">24.13</span></div><p>Copy of the rule in a tooltip, longer than twenty characters.</p></span></div>
<div class="mvName">FALL-BACK MOVE<span class="h_number">09.07</span></div><p>A unit that is engaged can fall back up to its Move characteristic.</p>
<h3 id="Desperate-Escape">Desperate Escape <span class="h_number">09.07.01</span></h3><p>Roll for each model that would fall back over enemy models.</p>
<div class="abName">[LETHAL HITS]<span class="h_number">24.23</span></div><p>Critical hits automatically wound the target.</p>
<div class="abName">LEADER <span class="h_number">24.22</span> / SUPPORT <span class="h_number">24.34</span></div><p>Some characters can be attached to other units before the battle.</p>`;
    const sections = parseCoreRules(html);
    expect(sections.map((s) => `${s.num} ${s.title}`)).toEqual(['03.01 Moving Units', '09.07 Fall-Back Move', '09.07.01 Desperate Escape', '24.23 Lethal Hits', '24.22 Leader / Support']);
    expect(sections[1]!.text).toContain('fall back up to');
    expect(sections[1]!.text).not.toContain('Roll for each');
    const { setCoreSections, findCoreSection } = await import('../rules/glossary');
    setCoreSections(sections);
    expect(findCoreSection('Fall Back')?.num).toBe('09.07');
    expect(findCoreSection('Fell Back')?.num).toBe('09.07');
    setCoreSections([]);
  });
});

describe('Wahapedia rows over several lines', () => {
  it('keeps reading a row until its closing "|"', () => {
    const csv = 'id|name|description|\n1|Martial Ka’tah|Intro text.\n\n<b>CONSERVAI</b><br>More text.|\n2|Next|One line.|\n';
    expect(parsePipeCsv(csv).map((r) => [r.name, r.description])).toEqual([
      ['Martial Ka’tah', 'Intro text.\n<b>CONSERVAI</b><br>More text.'],
      ['Next', 'One line.'],
    ]);
  });
});
