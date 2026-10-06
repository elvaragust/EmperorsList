import type { UnitModels } from '@/engine/rules/models';

/** The models in a unit and what each carries — a plain list, used while building (the shots grid is for battle). */
export function Composition({ models }: { models: UnitModels }) {
  const counts = new Map<string, number>();
  models.models.forEach((m) => counts.set(m.loadoutKey, (counts.get(m.loadoutKey) ?? 0) + 1));
  const groups = new Map<string, typeof models.loadouts>();
  models.loadouts.forEach((l) => groups.set(l.group, [...(groups.get(l.group) ?? []), l]));
  if (!models.models.length) return <p className="muted">No models selected.</p>;
  return (
    <div className="card">
      {[...groups.entries()].map(([group, list]) => (
        <div key={group} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '10px 14px' }}>
          {list.length > 1 || list[0]!.name !== group ? <div className="section-label" style={{ margin: 0 }}>{group}</div> : null}
          {list.map((l) => {
            const weapons = new Map<string, number>();
            l.weaponIds.forEach((id) => {
              const w = models.weapons.get(id);
              if (w) weapons.set(w.name, (weapons.get(w.name) ?? 0) + 1);
            });
            return (
              <div key={l.key}>
                <span className="mult">{counts.get(l.key) ?? 0}×</span>
                <strong>{l.name}</strong>
                <div className="muted small" style={{ paddingLeft: 32 }}>
                  {[...weapons.entries()].map(([n, k]) => (k > 1 ? `${k}× ${n}` : n)).join(', ') || 'No weapons'}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
