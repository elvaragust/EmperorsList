import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '@/data/db';
import { saveRoster, useRosterEngine } from '@/data/gameData';
import { newUnit } from '@/engine/rules/edit';
import { datasheet, unitModels } from '@/engine/rules/models';
import { RosterEngine } from '@/engine/rules/rosterEngine';
import { choiceRole, ROLES } from '@/engine/rules/roles';
import { Sheet } from '@/ui/Sheet';
import { Composition } from '@/ui/Composition';
import { AbilityList, StatLine } from '@/ui/DatasheetView';
import { PinButton, pinId } from '@/ui/PinButton';
import { Term } from '@/ui/RulesText';
import { showToast } from '@/ui/Toast';
import { useFactionTheme } from '@/theme/themes';
import { Screen } from '@/ui/Screen';

const FILTERS = ['All', ...ROLES] as const;
const SHORT: Record<string, string> = { 'Dedicated Transports': 'Transports' };

function rank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (!q) return 0;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(/[\s-]+/).some((w) => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return -1;
}

export function AddUnitScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const roster = useLiveQuery(() => db.rosters.get(id), [id]);
  const { engine, index } = useRosterEngine(roster);
  useFactionTheme(roster?.factionName);
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  const [role, setRole] = useState<(typeof FILTERS)[number]>(() => (FILTERS as readonly string[]).includes(params.get('role') ?? '') ? (params.get('role') as (typeof FILTERS)[number]) : 'All');
  const [preview, setPreview] = useState<string | null>(null);
  const previewData = useMemo(() => {
    if (!engine || !roster || !preview) return undefined;
    const unit = newUnit(engine, preview);
    const e2 = new RosterEngine(engine.index, { ...roster, units: [...roster.units, unit] }, [...engine.roots.values()]);
    const inst = e2.unitInst(unit.id)!;
    return { name: e2.unitName(unit.id), points: e2.unitPoints(unit.id), sheet: datasheet(e2, inst), models: unitModels(e2, unit.id) };
  }, [engine, roster, preview]);

  const choices = useMemo(() => engine?.unitChoices() ?? [], [engine]);
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return choices
      .map((c) => {
        const cat = engine?.index.categories.get(c.category ?? '')?.name ?? '';
        const r = engine ? choiceRole(engine, c.root.node, c.category) : 'Other datasheets';
        return { ...c, role: r, cat, score: rank(c.name, query) };
      })
      .filter((c) => c.score >= 0 && (role === 'All' || c.role === role))
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  }, [choices, q, role, engine]);

  /** Add a unit and stay here, so several can be added in a row. */
  const add = async (key: string, open = false) => {
    if (!engine || !roster) return;
    const unit = newUnit(engine, key);
    await saveRoster(index, { ...roster, units: [...roster.units, unit] });
    if (open) navigate(`/roster/${roster.id}/unit/${unit.id}`, { replace: true });
    else showToast(`Added ${unit.name}`, { label: 'EDIT', to: `/roster/${roster.id}/unit/${unit.id}` });
  };

  const inList = (key: string) => roster?.units.filter((u) => u.entryId === key).length ?? 0;

  return (
    <Screen title="Add unit" back>
      <input className="input" placeholder="Search units" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search units" />
      <div className="filters" role="tablist">
        {FILTERS.map((r) => (
          <button key={r} className={`filter ${role === r ? 'on' : ''}`} onClick={() => setRole(r)} role="tab" aria-selected={role === r}>
            {SHORT[r] ?? r}
          </button>
        ))}
      </div>
      {!engine && <p className="muted">Loading units…</p>}
      <div className="card">
        {list.map((c) => {
          const n = inList(c.root.key);
          return (
            <div key={c.root.key} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--line-soft)' }}>
              <button className="choice" style={{ borderTop: 0, flex: 1 }} onClick={() => setPreview(c.root.key)}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div className="muted small">
                    {c.role === 'Allied units' ? `Allied · ${c.cat}` : c.cat}
                    {n ? ` · ${n} in list` : ''}
                  </div>
                </span>
                <span className="num muted">{c.points}</span>
              </button>
              <button className="icon-btn" aria-label={`Add ${c.name}`} title="Add to list" onClick={() => add(c.root.key)} style={{ color: 'var(--accent)', fontSize: 24 }}>
                +
              </button>
            </div>
          );
        })}
      </div>
      {engine && list.length === 0 && <p className="muted">No units match.</p>}
      <p className="small muted">Tap a unit to read it first, or + to add it straight away (you stay here to add more).</p>
      {roster && (
        <div className="sticky-bar">
          <span className="pts-chip">{(engine?.totalPoints() ?? 0).toLocaleString('en')} / {(engine?.pointsLimit() ?? roster.pointsLimit).toLocaleString('en')}</span>
          <span className="muted small" style={{ flex: 1 }}>
            {roster.units.length} units in the list
          </span>
          <button className="btn btn-sm btn-primary" onClick={() => navigate(`/roster/${roster.id}`, { replace: true })}>
            Done
          </button>
        </div>
      )}
      <Sheet open={Boolean(preview)} onClose={() => setPreview(null)} title={previewData?.name}>
        {previewData && preview && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="num">{previewData.points} pts</span>
              <span className="muted small" style={{ flex: 1 }}>
                default loadout
              </span>
              <PinButton pin={{ id: pinId('datasheet', previewData.name), kind: 'datasheet', name: previewData.name, route: `/reference/unit/${roster?.catalogueId}/${preview}`, source: `${previewData.points} pts` }} />
            </div>
            <button className="btn btn-primary btn-block" style={{ margin: '10px 0' }} onClick={() => (add(preview), setPreview(null))}>
              Add to list
            </button>
            {previewData.sheet.stats.map((p) => (
              <StatLine key={p.id + p.name} profile={p} />
            ))}
            <div className="section-label">Models</div>
            <Composition models={previewData.models} />
            {previewData.sheet.abilities.length > 0 && <div className="section-label">Abilities</div>}
            <AbilityList abilities={previewData.sheet.abilities} index={engine?.index} />
            <div className="section-label">Keywords</div>
            <div className="kw-list">
              {previewData.sheet.keywords.map((k) => (
                <Term key={k} term={k} index={engine?.index} upper />
              ))}
            </div>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
