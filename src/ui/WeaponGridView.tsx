import { Fragment, useMemo, useState } from 'react';
import { computeWeaponGrid } from '@/engine/weaponGrid';
import type { ModelInstance, ModelLoadout, WeaponProfile } from '@/engine/types';

/**
 * The unit grid from the paper sketch: weapons as columns with total shots or
 * attacks in the header, one row per kind of model ("3×"), grouped by model
 * group. Tap a row to see single models and mark one as removed; totals update.
 */
export function WeaponGridView({
  loadouts,
  models,
  weapons,
  dead,
  onToggle,
}: {
  loadouts: ModelLoadout[];
  models: ModelInstance[];
  weapons: Map<string, WeaponProfile>;
  dead: string[];
  onToggle?: (modelId: string, alive: boolean) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const deadSet = useMemo(() => new Set(dead), [dead]);
  const live = useMemo(() => models.map((m) => ({ ...m, alive: !deadSet.has(m.id) })), [models, deadSet]);
  const grid = useMemo(() => computeWeaponGrid(loadouts, live, weapons), [loadouts, live, weapons]);
  const firstMelee = grid.columns.findIndex((c) => c.melee);
  // Two different weapons can share a code (e.g. two master-crafted power weapons): number them.
  const shorts = grid.columns.map((c, i) => {
    const same = grid.columns.filter((x) => x.short === c.short);
    return same.length > 1 ? `${c.short}${grid.columns.slice(0, i + 1).filter((x) => x.short === c.short).length}` : c.short;
  });
  const deadByLoadout = useMemo(() => {
    const m = new Map<string, ModelInstance[]>();
    live.forEach((x) => {
      if (x.alive) return;
      const list = m.get(x.loadoutKey) ?? [];
      list.push(x);
      m.set(x.loadoutKey, list);
    });
    return m;
  }, [live]);

  if (!models.length) return <p className="muted">No models selected.</p>;

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="grid">
        <thead>
          <tr>
            <th style={{ textAlign: 'left', paddingLeft: 10 }}>
              <span className="unit">{grid.aliveModels} MODELS</span>
            </th>
            {grid.columns.map((c, i) => (
              <th key={c.weaponId} className={i === firstMelee ? 'melee-start' : undefined} title={c.name}>
                {shorts[i]}
                <span className="total">{c.total}</span>
                <span className="unit">{c.melee ? 'ATK' : 'SHOTS'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.groups.map((g) => (
            <Fragment key={g.label}>
              <tr className="group">
                <td colSpan={grid.columns.length + 1}>
                  {g.label.toUpperCase()} · {g.count}
                </td>
              </tr>
              {g.rows.map((r) => (
                <Fragment key={r.loadoutKey}>
                  <tr
                    onClick={() => onToggle && setOpen((o) => ({ ...o, [r.loadoutKey]: !o[r.loadoutKey] }))}
                    style={{ cursor: onToggle ? 'pointer' : undefined }}
                    aria-expanded={onToggle ? Boolean(open[r.loadoutKey]) : undefined}
                  >
                    <td className="name">
                      <span className="mult">{r.count}×</span>
                      {r.name}
                    </td>
                    {r.cells.map((v, i) => (
                      <td key={i} className={i === firstMelee ? 'melee-start' : undefined}>
                        {v}
                      </td>
                    ))}
                  </tr>
                  {open[r.loadoutKey] &&
                    r.modelIds.map((id, n) => (
                      <tr key={id}>
                        <td className="name muted" colSpan={grid.columns.length + 1}>
                          <button className="btn btn-sm btn-ghost btn-danger" onClick={() => onToggle?.(id, false)} aria-label={`Remove ${r.name} ${n + 1}`}>
                            ✕ Remove model {n + 1}
                          </button>
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </Fragment>
          ))}
          {deadByLoadout.size > 0 && (
            <>
              <tr className="group">
                <td colSpan={grid.columns.length + 1}>REMOVED · {[...deadByLoadout.values()].reduce((s, l) => s + l.length, 0)}</td>
              </tr>
              {[...deadByLoadout.entries()].map(([key, list]) => {
                const l = loadouts.find((x) => x.key === key);
                return list.map((m) => (
                  <tr key={m.id} className="dead-row">
                    <td className="name muted" colSpan={grid.columns.length + 1}>
                      <span style={{ textDecoration: 'line-through' }}>{l?.name}</span>
                      {onToggle && (
                        <button className="btn btn-sm btn-ghost" onClick={() => onToggle(m.id, true)}>
                          Bring back
                        </button>
                      )}
                    </td>
                  </tr>
                ));
              })}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
