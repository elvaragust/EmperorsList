import { Fragment, useMemo, useState } from 'react';
import { computeWeaponGrid } from '@/engine/weaponGrid';
import type { ModelInstance } from '@/engine/types';
import { sketchLoadouts, sketchModels, sketchWeapons } from '@/sample/sketchSquad';
import { Screen } from '@/ui/Screen';

/** The unit grid: weapons as columns with totals, models as rows, identical models merged. */
export function UnitScreen() {
  const [models, setModels] = useState<ModelInstance[]>(sketchModels);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<ModelInstance | null>(null);
  const grid = useMemo(() => computeWeaponGrid(sketchLoadouts, models, sketchWeapons), [models]);
  const firstMelee = grid.columns.findIndex((c) => c.melee);

  const remove = (id: string) => {
    const m = models.find((x) => x.id === id);
    if (!m) return;
    setModels((ms) => ms.map((x) => (x.id === id ? { ...x, alive: false } : x)));
    setRemoved(m);
  };
  const undo = () => {
    if (!removed) return;
    setModels((ms) => ms.map((x) => (x.id === removed.id ? { ...x, alive: true } : x)));
    setRemoved(null);
  };

  return (
    <Screen title="Sample squad" back>
      <p className="muted small">{grid.aliveModels} models · tap a row to split it into single models</p>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingLeft: 10 }}>
                <span className="unit">MODEL</span>
              </th>
              {grid.columns.map((c, i) => (
                <th key={c.weaponId} className={i === firstMelee ? 'melee-start' : undefined} title={c.name}>
                  {c.short}
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
                    <tr onClick={() => setOpen((o) => ({ ...o, [r.loadoutKey]: !o[r.loadoutKey] }))} style={{ cursor: 'pointer' }}>
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
                          <td className="name muted">
                            <button className="icon-btn" aria-label={`Remove ${r.name} ${n + 1}`} onClick={() => remove(id)} style={{ color: 'var(--danger)' }}>
                              ✕
                            </button>
                            Model {n + 1}
                          </td>
                          <td colSpan={grid.columns.length} />
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {removed && (
        <div className="toast" role="status">
          <span style={{ flex: 1 }}>Model removed · {grid.aliveModels} left</span>
          <button className="btn" style={{ minHeight: 40, background: 'transparent', border: 0, color: 'var(--accent-strong)' }} onClick={undo}>
            Undo
          </button>
        </div>
      )}
    </Screen>
  );
}
