import { describe, expect, it } from 'vitest';
import { computeWeaponGrid, sumAttacks } from '../weaponGrid';
import { sketchLoadouts, sketchModels, sketchWeapons } from './sketchFixture';

describe('sumAttacks', () => {
  it('adds flat attacks', () => {
    expect(sumAttacks([{ attacks: '3', count: 5 }])).toBe('15');
  });
  it('keeps dice symbolic and adds flat parts', () => {
    expect(sumAttacks([{ attacks: 'D3', count: 2 }, { attacks: '2', count: 4 }])).toBe('2D3+8');
    expect(sumAttacks([{ attacks: 'D6+1', count: 2 }])).toBe('2D6+2');
  });
  it('ignores zero counts', () => {
    expect(sumAttacks([{ attacks: '4', count: 0 }])).toBe('0');
  });
});

describe('computeWeaponGrid — the paper sketch', () => {
  const totals = (g: ReturnType<typeof computeWeaponGrid>) =>
    Object.fromEntries(g.columns.map((c) => [c.short, c.total]));

  it('matches the totals on the sketch', () => {
    const grid = computeWeaponGrid(sketchLoadouts, sketchModels(), sketchWeapons);
    expect(totals(grid)).toEqual({ HBP: '6', BP: '9', MC: '3', CC: '15', IC: '12', PF: '6', NC: '16' });
    expect(grid.aliveModels).toBe(10);
  });

  it('puts ranged columns before melee', () => {
    const grid = computeWeaponGrid(sketchLoadouts, sketchModels(), sketchWeapons);
    const firstMelee = grid.columns.findIndex((c) => c.melee);
    expect(grid.columns.slice(firstMelee).every((c) => c.melee)).toBe(true);
  });

  it('collapses identical models into one row and brackets them by group', () => {
    const grid = computeWeaponGrid(sketchLoadouts, sketchModels(), sketchWeapons);
    expect(grid.groups.map((g) => [g.label, g.count])).toEqual([
      ['Sword Brother', 1],
      ['Initiates', 5],
      ['Neophytes', 4],
    ]);
    const initiates = grid.groups[1]!;
    expect(initiates.rows.map((r) => [r.name, r.count])).toEqual([
      ['Initiate', 3],
      ['Initiate · fist', 2],
    ]);
  });

  it('updates totals and drops empty columns when models die', () => {
    const models = sketchModels().map((m) => (m.loadoutKey === 'ip' ? { ...m, alive: false } : m));
    const grid = computeWeaponGrid(sketchLoadouts, models, sketchWeapons);
    expect(totals(grid).PF).toBeUndefined();
    expect(totals(grid).HBP).toBe('4');
    expect(grid.aliveModels).toBe(8);
  });
});
