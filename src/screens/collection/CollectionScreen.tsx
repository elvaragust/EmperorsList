import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db, type CollectionItem } from '@/data/db';
import { rootsFor, useIndex, useRosterEngine } from '@/data/gameData';
import { unitModels } from '@/engine/rules/models';
import { RosterEngine } from '@/engine/rules/rosterEngine';
import { blankRoster } from '@/search/buildDocs';
import { Screen } from '@/ui/Screen';
import { Stepper } from '@/ui/Stepper';

/**
 * What you own: models owned, built and painted per datasheet. Keyed by the
 * datasheet's entry id, so it carries across lists and data updates.
 */
export function CollectionScreen() {
  const [params] = useSearchParams();
  const rosterId = params.get('roster') ?? '';
  const files = useLiveQuery(() => db.dataMeta.toArray(), []);
  const items = useLiveQuery(() => db.collection.toArray(), []);
  const roster = useLiveQuery(() => (rosterId ? db.rosters.get(rosterId) : undefined), [rosterId]);
  const factions = (files ?? []).filter((f) => !f.library && !f.gameSystem && f.catalogueId);
  const [picked, setPicked] = useState('');
  const catalogueId = roster?.catalogueId ?? picked ?? '';
  const { index } = useIndex(catalogueId || undefined);
  const { engine: rosterEngine } = useRosterEngine(roster);
  const [q, setQ] = useState('');
  const [onlyOwned, setOnlyOwned] = useState(false);

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.entryId, i])), [items]);
  const units = useMemo(() => {
    if (!index || !catalogueId) return [];
    const engine = new RosterEngine(index, blankRoster(catalogueId), rootsFor(index, catalogueId));
    return engine.unitChoices().map((u) => ({ id: u.root.node.targetId, name: u.name }));
  }, [index, catalogueId]);

  const setItem = (id: string, name: string, patch: Partial<CollectionItem>) => {
    const cur = byId.get(id) ?? { entryId: id, name, catalogueId, owned: 0, built: 0, painted: 0 };
    const next = { ...cur, ...patch };
    next.built = Math.min(next.built, next.owned);
    next.painted = Math.min(next.painted, next.built);
    return db.collection.put(next);
  };

  const fieldCheck = useMemo(() => {
    if (!roster || !rosterEngine) return undefined;
    const need = new Map<string, { name: string; models: number }>();
    for (const u of roster.units) {
      const id = rosterEngine.unitInst(u.id)?.node?.targetId;
      if (!id) continue;
      const n = unitModels(rosterEngine, u.id).models.filter((m) => !m.id.endsWith('u#0')).length;
      const cur = need.get(id) ?? { name: u.name, models: 0 };
      cur.models += n;
      need.set(id, cur);
    }
    return [...need.entries()].map(([id, v]) => ({ id, ...v, owned: byId.get(id)?.owned ?? 0, painted: byId.get(id)?.painted ?? 0 }));
  }, [roster, rosterEngine, byId]);

  const list = units.filter((u) => (!q || u.name.toLowerCase().includes(q.toLowerCase())) && (!onlyOwned || (byId.get(u.id)?.owned ?? 0) > 0));
  const totals = (items ?? []).filter((i) => i.catalogueId === catalogueId).reduce((s, i) => ({ owned: s.owned + i.owned, built: s.built + i.built, painted: s.painted + i.painted }), { owned: 0, built: 0, painted: 0 });

  return (
    <Screen title="Collection">
      {roster && fieldCheck && (
        <>
          <div className="section-label">Can I field “{roster.name}”?</div>
          <div className="card">
            {fieldCheck.map((f) => (
              <div className="row" key={f.id}>
                <span style={{ flex: 1 }}>{f.name}</span>
                <span className="small muted">
                  need {f.models} · own {f.owned}
                </span>
                <span className={f.owned >= f.models ? 'tag' : 'issue-title small'}>{f.owned >= f.models ? (f.painted >= f.models ? 'PAINTED' : 'OK') : `${f.models - f.owned} short`}</span>
              </div>
            ))}
          </div>
          <p className="small muted">Counts models, using the numbers you enter below.</p>
        </>
      )}
      {!roster && (
        <label className="field">
          <span>Faction</span>
          <select className="input" value={picked} onChange={(e) => setPicked(e.target.value)}>
            <option value="">Choose a downloaded faction…</option>
            {factions.map((f) => (
              <option key={f.path} value={f.catalogueId}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {factions.length === 0 && (
        <p className="muted">
          Download a faction first by <Link to="/new">starting a list</Link>.
        </p>
      )}
      {catalogueId && (
        <>
          <p className="small muted">
            {totals.owned} models owned · {totals.built} built · {totals.painted} painted
          </p>
          <input className="input" placeholder="Search units" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search units" />
          <div className="filters">
            <button className={`filter ${!onlyOwned ? 'on' : ''}`} onClick={() => setOnlyOwned(false)}>
              All units
            </button>
            <button className={`filter ${onlyOwned ? 'on' : ''}`} onClick={() => setOnlyOwned(true)}>
              Owned
            </button>
          </div>
          <div className="card">
            {list.map((u) => {
              const it = byId.get(u.id);
              return (
                <div key={u.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: '10px 14px' }}>
                  <strong>{u.name}</strong>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(['owned', 'built', 'painted'] as const).map((k) => (
                      <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span className="small muted" style={{ width: 52 }}>
                          {k}
                        </span>
                        <Stepper value={it?.[k] ?? 0} onChange={(v) => setItem(u.id, u.name, { [k]: v })} label={`${k} ${u.name}`} />
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Screen>
  );
}
