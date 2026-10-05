/**
 * Checks against the real BSData files. Game data is never committed, so this
 * suite only runs when the files are present locally:
 *   node scripts/fetch-data.mjs    (downloads into ../data-cache)
 * or set EL_DATA to a folder holding the JSON files.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, type DataIndex } from '../bsdata/index';
import type { RawFile } from '../bsdata/raw';
import { RosterEngine, rootOptions } from '../rules/rosterEngine';
import { newUnit, refreshCaches, setOptionCount } from '../rules/edit';
import { unitModels } from '../rules/models';
import { computeWeaponGrid } from '../weaponGrid';
import type { Roster } from '../types';
import { configChoices, setBattleSize, setDetachments, setDisposition } from '../rules/config';

const dir = resolve(process.env.EL_DATA ?? join(__dirname, '../../../../data-cache'));
const have = existsSync(join(dir, 'Imperium - Black Templars.json'));
const BT = '7d75-6ddb-a1f6-2a4e';

function load(): DataIndex {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RawFile);
  return buildIndex(files);
}

function blank(catalogueId: string): Roster {
  return {
    id: 'r',
    name: 'Test',
    gameSystemId: '',
    catalogueId,
    factionName: 'Black Templars',
    battleSize: 'strikeForce',
    pointsLimit: 2000,
    config: [],
    detachmentIds: [],
    units: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe.skipIf(!have)('real 11th edition data', () => {
  const index = have ? load() : (undefined as unknown as DataIndex);
  const btId = have ? [...index.catalogues.values()].find((c) => /Black Templars/.test(c.name))!.id : BT;
  const roots = have ? rootOptions(index, btId) : [];

  it('finds units and configuration roots', () => {
    const names = roots.map((r) => r.node.name);
    expect(names).toContain('Crusader Squad');
    expect(names).toContain('Marshal');
    expect(roots.filter((r) => r.config).map((r) => r.node.name)).toEqual(expect.arrayContaining(['Battle Size', 'Detachment', 'Force Disposition']));
  });

  it('builds a valid-shaped Strike Force with detachment and disposition', () => {
    let roster = blank(btId);
    let eng = new RosterEngine(index, roster, roots);
    const choices = configChoices(eng);
    expect(choices.battleSizes.map((b) => b.name)).toContain('2. Strike Force (2000 Point limit)');
    const wrath = choices.detachments.find((d) => d.name === 'Wrathful Procession');
    expect(wrath?.dp).toBe(1);
    roster = setBattleSize(eng, roster, 'strikeForce');
    eng = new RosterEngine(index, roster, roots);
    roster = setDetachments(eng, roster, [wrath!.key]);
    eng = new RosterEngine(index, roster, roots);
    const visible = configChoices(eng).dispositions.filter((d) => !d.hidden);
    expect(visible.map((d) => d.name)).toEqual(['Take and Hold']);
    roster = setDisposition(eng, roster, visible[0]!.key);
    eng = new RosterEngine(index, roster, roots);
    expect(eng.pointsLimit()).toBe(2000);
    expect(eng.detachmentPoints()).toEqual({ used: 1, max: 3 });
    expect(eng.enhancements().max).toBe(4);
    expect(eng.issues().map((i) => i.title)).toEqual([]);
    const choiceNames = eng.unitChoices().map((u) => u.name);
    expect(choiceNames).toContain('Crusader Squad');
    expect(choiceNames.some((n) => /\[Legends\]/.test(n))).toBe(false);
  });

  it('adds a Crusader Squad with default models, points brackets and a grid', () => {
    let roster = blank(btId);
    let eng = new RosterEngine(index, roster, roots);
    roster = setBattleSize(eng, roster, 'strikeForce');
    eng = new RosterEngine(index, roster, roots);
    const key = roots.find((r) => r.node.name === 'Crusader Squad')!.key;
    const unit = newUnit(eng, key);
    roster = { ...roster, units: [unit] };
    eng = new RosterEngine(index, roster, roots);
    expect(eng.unitPoints(unit.id)).toBe(150);
    const m = unitModels(eng, unit.id);
    expect(m.models.length).toBe(10);
    const grid = computeWeaponGrid(m.loadouts, m.models, m.weapons);
    expect(grid.groups.map((g) => g.label)).toEqual(['Sword Brother', 'Initiates', 'Neophytes']);
    // Sword Brother takes one pistol only.
    const sb = m.loadouts.find((l) => l.name === 'Sword Brother')!;
    const pistols = sb.weaponIds.map((id) => m.weapons.get(id)!.name).filter((n) => /pistol/i.test(n));
    expect(pistols.length).toBe(1);
    expect(eng.issues().filter((i) => i.unitId === unit.id)).toEqual([]);

    // Grow to 11 models -> 290 pts bracket
    const inst = eng.unitInst(unit.id)!;
    const opts = eng.optionsUnder(inst);
    const crusaders = opts.find((o) => o.name === 'Crusaders')!;
    expect(crusaders.min).toBe(10);
    expect(crusaders.max).toBe(20);
    const initiates = crusaders.children.find((o) => o.name === 'Initiates')!;
    const bolt = initiates.children.find((o) => o.selected > 0)!;
    let u2 = setOptionCount(eng, unit, [], bolt.node.key, bolt.selected + 1);
    roster = { ...roster, units: [u2] };
    eng = new RosterEngine(index, roster, roots);
    expect(eng.unitPoints(unit.id)).toBe(290);
    roster = { ...roster, units: refreshCaches(eng, roster.units) };
    expect(roster.units[0]!.points).toBe(290);
    // Too many power fists -> issue
    const fist = initiates.children.find((o) => /Power Fist/i.test(o.name))!;
    expect(fist.max).toBe(2);
    u2 = setOptionCount(eng, roster.units[0]!, [], fist.node.key, 3);
    roster = { ...roster, units: [u2] };
    eng = new RosterEngine(index, roster, roots);
    const issues = eng.issues();
    expect(issues.some((i) => /Power Fist/i.test(i.title))).toBe(true);
  });

  it('copy limits, warlord, leaders and enhancements', () => {
    let roster = blank(btId);
    let eng = new RosterEngine(index, roster, roots);
    roster = setBattleSize(eng, roster, 'strikeForce');
    eng = new RosterEngine(index, roster, roots);
    const wrath = configChoices(eng).detachments.find((d) => d.name === 'Wrathful Procession')!;
    roster = setDetachments(eng, roster, [wrath.key]);
    eng = new RosterEngine(index, roster, roots);
    const marshalKey = roots.find((r) => r.node.name === 'Marshal')!.key;
    const squadKey = roots.find((r) => r.node.name === 'Crusader Squad')!.key;
    const m1 = newUnit(eng, marshalKey);
    const m2 = newUnit(eng, marshalKey);
    const sq = newUnit(eng, squadKey);
    roster = { ...roster, units: [m1, m2, sq] };
    eng = new RosterEngine(index, roster, roots);
    expect(eng.issues().some((i) => i.title === 'No Warlord')).toBe(true);
    const p1 = eng.unitPoints(m1.id);
    const p2 = eng.unitPoints(m2.id);
    expect(p2).toBeGreaterThanOrEqual(p1);
    expect(eng.canLead(m1.id)).toBe(true);
    expect(eng.attachTargets(m1.id)).toContain(sq.id);
    roster = { ...roster, units: [{ ...m1, leaderOf: sq.id }, m2, sq] };
    eng = new RosterEngine(index, roster, roots);
    expect(eng.issues().some((i) => /can't lead/.test(i.title))).toBe(false);
    roster = { ...roster, units: [{ ...m1, leaderOf: sq.id }, { ...m2, leaderOf: sq.id }, sq] };
    eng = new RosterEngine(index, roster, roots);
    expect(eng.issues().some((i) => /too many attached/.test(i.title))).toBe(true);

    // Enhancements for the chosen detachment are visible, others hidden
    const chapKey = roots.find((r) => r.node.name === 'Chaplain')!.key;
    const chap = newUnit(eng, chapKey);
    const rc = { ...roster, units: [...roster.units, chap] };
    const ec = new RosterEngine(index, rc, roots);
    const enh = ec.optionsUnder(ec.unitInst(chap.id)!).find((o) => o.name === 'Enhancements')!;
    const visible = enh.children.filter((g) => !g.hidden).map((g) => g.name);
    expect(visible).toEqual(['Wrathful Procession Enhancements']);
    const opts = eng.optionsUnder(eng.unitInst(m1.id)!);
    const warlord = opts.find((o) => o.name === 'Warlord')!;
    const withWarlord = setOptionCount(eng, roster.units[0]!, [], warlord.node.key, 1);
    roster = { ...roster, units: [withWarlord, roster.units[1]!, roster.units[2]!] };
    eng = new RosterEngine(index, roster, roots);
    expect(eng.isWarlord(m1.id)).toBe(true);
    expect(eng.issues().some((i) => /Warlord/.test(i.title))).toBe(false);
  });

  it('every Black Templars unit gets defaults without throwing and with sensible points', () => {
    let roster = blank(btId);
    let eng = new RosterEngine(index, roster, roots);
    roster = setBattleSize(eng, roster, 'strikeForce');
    eng = new RosterEngine(index, roster, roots);
    const choices = eng.unitChoices();
    const report: string[] = [];
    for (const c of choices) {
      const u = newUnit(eng, c.root.key);
      const r2 = { ...roster, units: [u] };
      const e2 = new RosterEngine(index, r2, roots);
      const pts = e2.unitPoints(u.id);
      const models = unitModels(e2, u.id).models.length;
      const issues = e2.issues().filter((i) => i.unitId === u.id);
      if (pts <= 0 || models === 0 || issues.length) report.push(`${c.name}: ${pts} pts, ${models} models, ${issues.map((i) => i.title).join('; ')}`);
    }
    console.log(`${choices.length} units; problems:\n${report.join('\n')}`);
    expect(report.length).toBeLessThan(choices.length * 0.1);
  });
});

describe.skipIf(!have)('every downloaded faction', () => {
  const index = have ? load() : (undefined as unknown as DataIndex);
  const factions = have ? [...index.catalogues.values()].filter((c) => !c.library && index.gameSystem?.id !== c.id) : [];
  for (const cat of factions) {
    it(`${cat.name}: units default cleanly`, () => {
      const roots = rootOptions(index, cat.id);
      let roster = blank(cat.id);
      let eng = new RosterEngine(index, roster, roots);
      roster = setBattleSize(eng, roster, 'strikeForce');
      eng = new RosterEngine(index, roster, roots);
      const choices = eng.unitChoices();
      const bad: string[] = [];
      for (const c of choices) {
        const u = newUnit(eng, c.root.key);
        const e2 = new RosterEngine(index, { ...roster, units: [u] }, roots);
        const pts = e2.unitPoints(u.id);
        const models = unitModels(e2, u.id).models.length;
        const issues = e2.issues().filter((i) => i.unitId === u.id && !/must join/.test(i.title));
        if (pts <= 0 || models === 0 || issues.length) bad.push(`${c.name}: ${pts} pts, ${models} models; ${issues.map((i) => i.title).join('; ')}`);
      }
      console.log(`${cat.name}: ${choices.length} units, ${bad.length} flagged\n  ${bad.join('\n  ')}`);
      expect(choices.length).toBeGreaterThan(5);
      expect(bad.length).toBeLessThan(Math.max(3, choices.length * 0.1));
    });
  }
});

describe.skipIf(!have)('text export and import round trip', () => {
  it('exports a list and imports it back with the same units and points', async () => {
    const { exportText, parseListText, importUnit } = await import('../listText');
    const index = load();
    const btId = [...index.catalogues.values()].find((c) => /Black Templars/.test(c.name))!.id;
    const roots = rootOptions(index, btId);
    let roster = blank(btId);
    let eng = new RosterEngine(index, roster, roots);
    roster = setBattleSize(eng, roster, 'strikeForce');
    eng = new RosterEngine(index, roster, roots);
    const names = ['Marshal', 'Crusader Squad', 'Land Raider Crusader', 'Sword Brethren Squad'];
    let units = names.map((n) => newUnit(eng, roots.find((r) => r.node.name === n)!.key));
    roster = { ...roster, units };
    eng = new RosterEngine(index, roster, roots);
    const warlord = eng.optionsUnder(eng.unitInst(units[0]!.id)!).find((o) => o.name === 'Warlord')!;
    units = [setOptionCount(eng, units[0]!, [], warlord.node.key, 1), ...units.slice(1)];
    roster = { ...roster, units };
    eng = new RosterEngine(index, roster, roots);
    const text = exportText(eng, roster);
    const parsed = parseListText(text);
    expect(parsed.units.map((u) => u.name)).toEqual(expect.arrayContaining(names));
    const report = { matched: [] as string[], unmatched: [] as string[] };
    const imported = [];
    for (const pu of parsed.units) {
      const u = importUnit((us) => new RosterEngine(index, { ...roster, units: us }, roots), imported, pu, report);
      if (u) imported.push(u);
    }
    const e2 = new RosterEngine(index, { ...roster, units: imported }, roots);
    expect(report.unmatched).toEqual([]);
    expect(e2.totalPoints()).toBe(eng.totalPoints());
    expect(imported.some((u) => e2.isWarlord(u.id))).toBe(true);
    const m1 = imported.map((u) => unitModels(e2, u.id).models.length).sort();
    const m0 = units.map((u) => unitModels(eng, u.id).models.length).sort();
    expect(m1).toEqual(m0);
  });
});
