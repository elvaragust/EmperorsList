import type { RawProfile } from '@/engine/bsdata/raw';
import { unitModels, type UnitModels } from '@/engine/rules/models';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import type { RosterUnit } from '@/engine/types';

/**
 * Models of a bodyguard unit plus its attached characters as one grid.
 * Model ids are prefixed with their unit id ("unitId/path#n") so casualties
 * are stored against the right unit.
 */
export function combinedModels(engine: RosterEngine, units: RosterUnit[]): UnitModels {
  const out: UnitModels = { loadouts: [], models: [], weapons: new Map() };
  const sig = new Map<string, string>();
  for (const u of units) {
    const m = unitModels(engine, u.id, `${u.id}/`);
    const remap = new Map<string, string>();
    m.weapons.forEach((w, id) => {
      const key = [w.name.toLowerCase(), w.melee, w.attacks, w.strength, w.ap, w.damage].join('|');
      const existing = sig.get(key);
      if (existing) remap.set(id, existing);
      else {
        sig.set(key, id);
        remap.set(id, id);
        out.weapons.set(id, w);
      }
    });
    m.loadouts.forEach((l) => out.loadouts.push({ ...l, key: `${u.id}|${l.key}`, weaponIds: l.weaponIds.map((w) => remap.get(w) ?? w), group: units.length > 1 && l.group === l.name && u !== units[0] ? u.nickname || l.group : l.group }));
    m.models.forEach((x) => out.models.push({ ...x, loadoutKey: `${u.id}|${x.loadoutKey}` }));
  }
  return out;
}

/** Tag leader abilities that buff the unit they lead. */
export function leaderBuffTag(a: RawProfile): string | undefined {
  const text = a.characteristics?.map((c) => c.$text ?? '').join(' ') ?? '';
  if (/while this model is leading|this model's unit|the unit this model is leading|models in this model's unit|bodyguard/i.test(text)) return 'BUFFS THE UNIT';
  return undefined;
}
