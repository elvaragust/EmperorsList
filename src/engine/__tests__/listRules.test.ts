/**
 * List-building rules checked against the real BSData files (skipped when they
 * aren't downloaded — see realData.test.ts).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, type DataIndex } from '../bsdata/index';
import type { RawFile } from '../bsdata/raw';
import { RosterEngine, rootOptions, type OptionView } from '../rules/rosterEngine';
import { newUnit, setOptionCount } from '../rules/edit';
import { configChoices, setBattleSize, setDetachments } from '../rules/config';
import type { Roster, RosterUnit } from '../types';

const dir = resolve(process.env.EL_DATA ?? join(__dirname, '../../../../data-cache'));
const have = existsSync(join(dir, 'Imperium - Black Templars.json'));

function load(): DataIndex {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RawFile);
  return buildIndex(files);
}

function blank(catalogueId: string): Roster {
  return { id: 'r', name: 'Test', gameSystemId: '', catalogueId, factionName: 'Black Templars', battleSize: 'strikeForce', pointsLimit: 2000, config: [], detachmentIds: [], units: [], createdAt: 0, updatedAt: 0 };
}

const flat = (v: OptionView): OptionView[] => [v, ...v.children.flatMap(flat)];

describe.skipIf(!have)('list rules (real data)', () => {
  const index = have ? load() : (undefined as unknown as DataIndex);
  const btId = have ? [...index.catalogues.values()].find((c) => /Black Templars/.test(c.name))!.id : '';
  const roots = have ? rootOptions(index, btId) : [];
  const key = (n: string) => roots.find((r) => r.node.name === n)!.key;
  const base = () => {
    let r = blank(btId);
    r = setBattleSize(new RosterEngine(index, r, roots), r, 'strikeForce');
    const det = configChoices(new RosterEngine(index, r, roots)).detachments.find((d) => d.name === 'Gladius Task Force') ?? configChoices(new RosterEngine(index, r, roots)).detachments.find((d) => !d.hidden)!;
    return setDetachments(new RosterEngine(index, r, roots), r, [det.key]);
  };

  /** A Crusader Squad with `fists` Power Fist Initiates and `extra` more Initiates / Neophytes on top of the defaults. */
  function crusaders(fists: number, extra: number) {
    const r = base();
    const eng = (units: RosterUnit[]) => new RosterEngine(index, { ...r, units }, roots);
    let unit = newUnit(eng([]), key('Crusader Squad'));
    let e = eng([unit]);
    const crusOf = () => e.optionsUnder(e.unitInst(unit.id)!).find((o) => o.name === 'Crusaders')!;
    const fist = flat(crusOf()).find((o) => o.kind === 'entry' && /Power Fist/i.test(o.name))!;
    unit = setOptionCount(e, unit, [], fist.node.key, fists);
    e = eng([unit]);
    // Fill the Initiates first, then the Neophytes, each up to its group's limit.
    let left = extra;
    for (const kind of ['Initiates', 'Neophytes']) {
      const g = crusOf().children.find((o) => o.name === kind)!;
      const pick = flat(g).find((o) => o.kind === 'entry' && o.selected > 0 && !/Power Fist/i.test(o.name))!;
      const n = Math.min(left, g.max < 0 ? left : g.max - g.selected);
      if (n <= 0) continue;
      unit = setOptionCount(e, unit, [], pick.node.key, pick.selected + n);
      e = eng([unit]);
      left -= n;
    }
    return { e, unit, models: crusOf().selected };
  }
  const perTen = (e: RosterEngine, unit: RosterUnit) => flat(e.optionsUnder(e.unitInst(unit.id)!).find((o) => o.name === 'Crusaders')!).find((o) => o.kind === 'group' && /per 10 models/i.test(o.name))!;

  it('flags more than 2 Power Fist Initiates in a Crusader Squad under 20 models', () => {
    const { e, unit, models } = crusaders(4, 0);
    expect(models).toBeGreaterThan(10);
    expect(models).toBeLessThan(20);
    expect(e.issues().some((i) => i.unitId === unit.id && /Max 2 per 10 models/.test(i.title) && i.severity === 'error')).toBe(true);
    // The band shows the limit that applies now, not the data's fixed 4.
    expect(perTen(e, unit).max).toBe(2);
  });

  it('allows 4 Power Fist Initiates once the squad has 20 models', () => {
    const first = crusaders(4, 0);
    const { e, unit, models } = crusaders(4, 20 - first.models);
    expect(models).toBe(20);
    expect(e.issues().filter((i) => i.unitId === unit.id).map((i) => i.title)).toEqual([]);
    expect(perTen(e, unit).max).toBe(4);
  });

  it('allows 2 Power Fist Initiates in a 10-model squad', () => {
    const { e, unit } = crusaders(2, 0);
    expect(perTen(e, unit).max).toBe(2);
    expect(e.issues().filter((i) => /per 10 models/.test(i.title))).toEqual([]);
  });

  it('flags an Attached Unit with two Enhancements', () => {
    let r = base();
    const eng = (units: RosterUnit[]) => new RosterEngine(index, { ...r, units }, roots);
    const enhance = (e: RosterEngine, u: RosterUnit, skip?: string) => {
      const groups = e.optionsUnder(e.unitInst(u.id)!).filter((v) => v.kind === 'group' && /enhancement/i.test(v.name) && !v.hidden);
      const leaves = groups.flatMap((g) => flat(g)).filter((o) => o.kind === 'entry' && !o.hidden && o.node.key !== skip);
      return { unit: setOptionCount(e, u, [], leaves[0]!.node.key, 1), key: leaves[0]!.node.key };
    };
    let marshal = newUnit(eng([]), key('Marshal'));
    let chaplain = newUnit(eng([]), key('Chaplain'));
    const squad = newUnit(eng([]), key('Crusader Squad'));
    let e = eng([marshal, chaplain, squad]);
    const one = enhance(e, marshal);
    marshal = one.unit;
    chaplain = enhance(eng([marshal, chaplain, squad]), chaplain, one.key).unit;
    marshal = { ...marshal, leaderOf: squad.id };
    // One leader with an Enhancement: fine.
    e = eng([marshal, { ...chaplain, leaderOf: undefined }, squad]);
    expect(e.issues().some((i) => /Enhancement/.test(i.why) && /Attached Unit/.test(i.why))).toBe(false);
    // Both leaders with an Enhancement in the same unit: not allowed.
    chaplain = { ...chaplain, leaderOf: squad.id };
    r = { ...r, units: [marshal, chaplain, squad] };
    e = new RosterEngine(index, r, roots);
    const hit = e.issues().find((i) => /An Attached Unit can only take 1 Enhancement/.test(i.why));
    expect(hit?.severity).toBe('error');
    expect(hit?.unitId).toBe(squad.id);
  });
});
