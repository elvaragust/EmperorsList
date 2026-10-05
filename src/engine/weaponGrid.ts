import type { ModelInstance, ModelLoadout, WeaponProfile } from './types';

/**
 * The unit grid from Elvar's paper sketch:
 *  - one column per weapon, header shows total shots (ranged) or attacks (melee)
 *  - one row per kind of model; identical models collapse into "3×"
 *  - rows are bracketed by model group (Sword Brother / Initiates / Neophytes)
 *  - removing or killing a model updates every total
 */

export interface GridColumn {
  weaponId: string;
  short: string;
  name: string;
  melee: boolean;
  /** Total across living models, e.g. "15" or "2D3+4". */
  total: string;
}

export interface GridRow {
  loadoutKey: string;
  name: string;
  /** Number of living models with this loadout. */
  count: number;
  /** Ids of those models, so the UI can remove a single one. */
  modelIds: string[];
  /** Per-model value per column ("" when the model lacks that weapon). */
  cells: string[];
}

export interface GridGroup {
  label: string;
  count: number;
  rows: GridRow[];
}

export interface WeaponGrid {
  columns: GridColumn[];
  groups: GridGroup[];
  aliveModels: number;
}

/**
 * Sum attacks like "2", "D3", "D6+1" across `count` copies, keeping dice symbolic.
 * 3 × "D3" + 4 × "2" => "3D3+8".
 */
export function sumAttacks(parts: { attacks: string; count: number }[]): string {
  let flat = 0;
  const dice = new Map<string, number>();
  for (const { attacks, count } of parts) {
    if (count <= 0) continue;
    const m = attacks.trim().toUpperCase().match(/^(\d*)(D\d+)?(?:\+(\d+))?$/);
    if (!m) {
      flat += 0; // unknown format: leave it out of the sum rather than guess
      continue;
    }
    const [, n, die, plus] = m;
    if (die) {
      const k = (n ? Number(n) : 1) * count;
      dice.set(die, (dice.get(die) ?? 0) + k);
      flat += (plus ? Number(plus) : 0) * count;
    } else {
      flat += Number(n || 0) * count;
    }
  }
  const diceText = [...dice.entries()]
    .sort(([a], [b]) => Number(b.slice(1)) - Number(a.slice(1)))
    .map(([die, k]) => `${k}${die}`)
    .join('+');
  if (diceText && flat) return `${diceText}+${flat}`;
  return diceText || String(flat);
}

export function computeWeaponGrid(
  loadouts: ModelLoadout[],
  models: ModelInstance[],
  weapons: Map<string, WeaponProfile>,
): WeaponGrid {
  const alive = models.filter((m) => m.alive);
  const byLoadout = new Map<string, ModelInstance[]>();
  alive.forEach((m) => {
    const list = byLoadout.get(m.loadoutKey) ?? [];
    list.push(m);
    byLoadout.set(m.loadoutKey, list);
  });

  // Columns: weapons carried by any living model, ranged first, in loadout order.
  const seen = new Set<string>();
  const ordered: WeaponProfile[] = [];
  loadouts.forEach((l) => {
    if (!byLoadout.get(l.key)?.length) return;
    l.weaponIds.forEach((id) => {
      const w = weapons.get(id);
      if (w && !seen.has(id)) {
        seen.add(id);
        ordered.push(w);
      }
    });
  });
  ordered.sort((a, b) => Number(a.melee) - Number(b.melee));

  const columns: GridColumn[] = ordered.map((w) => ({
    weaponId: w.id,
    short: w.short,
    name: w.name,
    melee: w.melee,
    total: sumAttacks(
      loadouts.map((l) => ({
        attacks: w.attacks,
        count: occurrences(l, w.id) * (byLoadout.get(l.key)?.length ?? 0),
      })),
    ),
  }));

  const groups: GridGroup[] = [];
  loadouts.forEach((l) => {
    const living = byLoadout.get(l.key) ?? [];
    if (!living.length) return;
    let group = groups.find((g) => g.label === l.group);
    if (!group) {
      group = { label: l.group, count: 0, rows: [] };
      groups.push(group);
    }
    group.count += living.length;
    group.rows.push({
      loadoutKey: l.key,
      name: l.name,
      count: living.length,
      modelIds: living.map((m) => m.id),
      cells: ordered.map((w) => {
        const k = occurrences(l, w.id);
        return k === 0 ? '' : k === 1 ? w.attacks : sumAttacks([{ attacks: w.attacks, count: k }]);
      }),
    });
  });

  return { columns, groups, aliveModels: alive.length };
}

/** How many of a weapon one model of this loadout carries (e.g. two bolt pistols). */
function occurrences(l: ModelLoadout, weaponId: string): number {
  return l.weaponIds.reduce((n, id) => (id === weaponId ? n + 1 : n), 0);
}
