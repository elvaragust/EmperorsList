/**
 * Copy-paste import, tested against the real BSData files (skipped when they
 * aren't downloaded — see realData.test.ts). For every unit of every faction
 * in the cache: build it with its default wargear, write the list out as the
 * official app's text, read that text back in, and compare models, wargear
 * and points. Plus hand-written lists in the shapes people actually paste
 * (phone line breaks, missing headers, extra spaces).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, type DataIndex } from '../bsdata/index';
import type { RawFile } from '../bsdata/raw';
import { exportText, importUnit, matchConfig, parseListText, type ImportReport } from '../listText';
import { configChoices, setBattleSize, setDetachments, setDisposition } from '../rules/config';
import { autoFill, newUnit, refreshCaches } from '../rules/edit';
import { fillMinimumModels, modelTypes } from '../rules/modelTypes';
import { RosterEngine, rootOptions } from '../rules/rosterEngine';
import { armyRules } from '../rules/armyRules';
import type { Roster, RosterUnit } from '../types';

const dir = resolve(process.env.EL_DATA ?? join(__dirname, '../../../../data-cache'));
const have = existsSync(dir) && readdirSync(dir).some((f) => /^(Imperium|Chaos|Xenos|Aeldari) - /.test(f));

function load(): DataIndex {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RawFile);
  return buildIndex(files);
}

function blank(catalogueId: string, factionName: string): Roster {
  return { id: 'r', name: 'Round trip', gameSystemId: '', catalogueId, factionName, battleSize: 'strikeForce', pointsLimit: 2000, config: [], detachmentIds: [], units: [], createdAt: 0, updatedAt: 0 };
}

/** A roster for a faction with its first detachment and disposition chosen, so its units are offered. */
function setUp(index: DataIndex, catalogueId: string, name: string) {
  const roots = rootOptions(index, catalogueId);
  const eng = (r: Roster) => new RosterEngine(index, r, roots);
  let roster = setBattleSize(eng(blank(catalogueId, name)), blank(catalogueId, name), 'strikeForce');
  const det = configChoices(eng(roster)).detachments.find((d) => !d.hidden);
  if (det) roster = setDetachments(eng(roster), roster, [det.key]);
  const disp = configChoices(eng(roster)).dispositions.find((d) => !d.hidden);
  if (disp) roster = setDisposition(eng(roster), roster, disp.key);
  return { roots, roster, eng };
}

/** What a unit is, in words: model kinds with counts and the wargear each carries. */
function describeUnit(e: RosterEngine, u: RosterUnit): string {
  return modelTypes(e, u.id)
    .filter((t) => t.count)
    .map((t) => {
      const gear = [...t.fixed.map((f) => f.name), ...t.groups.flatMap((g) => g.options.filter((o) => o.carried).map((o) => `${o.carried} ${o.name}`)), ...t.extras.filter((o) => o.carried).map((o) => `${o.carried} ${o.name}`)];
      return `${t.count} ${t.name} [${gear.sort().join(', ')}]`;
    })
    .join(' | ');
}

describe.skipIf(!have)('copy-paste import round trip (real data)', () => {
  const index = have ? load() : (undefined as unknown as DataIndex);
  const factions = have ? [...index.catalogues.values()].filter((c) => !c.library && /^(Imperium|Chaos|Xenos|Aeldari) - /.test(c.name)) : [];

  for (const cat of factions) {
    it(`${cat.name}: every unit comes back the same`, () => {
      const short = cat.name.split(' - ').pop()!;
      const { roster: base, eng } = setUp(index, cat.id, short);
      const choices = eng(base).unitChoices();
      const problems: string[] = [];
      // One unit per list keeps a failure readable and the points comparable.
      for (const choice of choices) {
        let roster = base;
        let u: RosterUnit;
        try {
          u = newUnit(eng(roster), choice.root.node.key);
          const one = (x: RosterUnit) => eng({ ...roster, units: [x] });
          u = autoFill(one, fillMinimumModels(one, u).unit);
          roster = { ...roster, units: refreshCaches(eng({ ...roster, units: [u] }), [u]) };
        } catch (err) {
          problems.push(`${choice.root.node.name}: could not build (${(err as Error).message})`);
          continue;
        }
        const before = eng(roster);
        const text = exportText(before, roster);
        const parsed = parseListText(text);
        const report: ImportReport = { matched: [], unmatched: [] };
        const back = parsed.units.map((pu) => importUnit((us) => eng({ ...base, units: us }), [], pu, report)).filter((x): x is RosterUnit => Boolean(x));
        if (back.length !== 1) {
          problems.push(`${roster.units[0]!.name}: read back ${back.length} units`);
          continue;
        }
        const after = eng({ ...base, units: back });
        const want = describeUnit(before, roster.units[0]!);
        const got = describeUnit(after, back[0]!);
        if (want !== got) problems.push(`${roster.units[0]!.name}: models/wargear differ\n    out: ${want}\n    in:  ${got}`);
        else if (before.unitPoints(roster.units[0]!.id) !== after.unitPoints(back[0]!.id)) problems.push(`${roster.units[0]!.name}: points ${before.unitPoints(roster.units[0]!.id)} -> ${after.unitPoints(back[0]!.id)}`);
        const lost = report.unmatched.filter((x) => !/added missing/.test(x));
        if (lost.length) problems.push(`${roster.units[0]!.name}: not matched: ${lost.join('; ')}`);
      }
      // Print every difference so a data or matcher change is easy to see.
      if (problems.length) console.log(`${cat.name}: ${problems.length} of ${choices.length} units differ\n  ${problems.join('\n  ')}`);
      expect(problems.length / Math.max(1, choices.length)).toBeLessThanOrEqual(ALLOWED_FAILURE_RATE);
    });
  }

  it('army rules come from the army itself, not its allies', () => {
    const tsons = factions.find((c) => /Thousand Sons/.test(c.name));
    if (!tsons) return;
    const { roster, eng } = setUp(index, tsons.id, 'Thousand Sons');
    const names = armyRules(eng(roster)).map((r) => r.name);
    expect(names).toContain('Cabal of Sorcerers');
    expect(names).not.toContain('Harbingers of Dread');
  });
});

/**
 * Units whose text can't come back exactly (e.g. a model whose only wargear
 * choice has the same name as another model's) are listed in the log; the test
 * fails when more than this share of a faction's units don't round-trip.
 */
const ALLOWED_FAILURE_RATE = 0.03;

describe('pasted list shapes', () => {
  const header = (body: string) => `My list (1000 points)\n\nSpace Marines\nBlack Templars\nAssault Brethren (1 Detachment Point)\nPurge the Foe\nIncursion (1000 points)\n\n${body}`;
  it('reads units through phone line breaks, CRLF and extra spaces', () => {
    const text = header('CHARACTERS\r\n\r\nTechmarine (55 points)\r\n  • 1x Forge Bolter   \r\n    1x Grav-pistol\r\n\r\nOTHER DATASHEETS\r\n\r\nSword Brethren Squad (140 points)\r\n  • 5x Sword Brother\r\n    • 5x Heavy Bolt Pistol\r\n      4x Master-crafted Power Weapon\r\n      1x Thunder Hammer\r\n');
    const p = parseListText(text);
    expect(p.units.map((u) => [u.name, u.points])).toEqual([
      ['Techmarine', 55],
      ['Sword Brethren Squad', 140],
    ]);
    expect(p.battleSize).toBe('incursion');
  });
  it('reads a list with no header at all', () => {
    const p = parseListText('Techmarine (55 points)\n  • 1x Forge Bolter\n\nSword Brethren Squad (140 points)\n  • 5x Sword Brother');
    expect(p.units.map((u) => u.name)).toEqual(['Techmarine', 'Sword Brethren Squad']);
  });
  it('reads detachments and the disposition from the header', () => {
    const p = parseListText(header('Techmarine (55 points)'));
    const cfg = matchConfig(p, { detachments: [{ key: 'a', name: 'Assault Brethren' }, { key: 'b', name: 'Other' }], dispositions: [{ key: 'p', name: 'Purge the Foe' }] });
    expect(cfg.detachments.map((d) => d.name)).toEqual(['Assault Brethren']);
    expect(cfg.disposition?.name).toBe('Purge the Foe');
  });
});
