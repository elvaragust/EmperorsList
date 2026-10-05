import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { saveRoster, useRosterEngine } from '@/data/gameData';
import { newUnit } from '@/engine/rules/edit';
import { useFactionTheme } from '@/theme/themes';
import { Screen } from '@/ui/Screen';

const ROLES = ['All', 'Characters', 'Battleline', 'Transports', 'Other'] as const;

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
  const [role, setRole] = useState<(typeof ROLES)[number]>('All');

  const choices = useMemo(() => engine?.unitChoices() ?? [], [engine]);
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return choices
      .map((c) => {
        const cat = engine?.index.categories.get(c.category ?? '')?.name ?? '';
        const r = /character|epic/i.test(cat) ? 'Characters' : /battleline/i.test(cat) ? 'Battleline' : /transport/i.test(cat) ? 'Transports' : 'Other';
        return { ...c, role: r, cat, score: rank(c.name, query) };
      })
      .filter((c) => c.score >= 0 && (role === 'All' || c.role === role))
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  }, [choices, q, role, engine]);

  const add = async (key: string) => {
    if (!engine || !roster) return;
    const unit = newUnit(engine, key);
    await saveRoster(index, { ...roster, units: [...roster.units, unit] });
    navigate(`/roster/${roster.id}/unit/${unit.id}`, { replace: true });
  };

  const inList = (key: string) => roster?.units.filter((u) => u.entryId === key).length ?? 0;

  return (
    <Screen title="Add unit" back>
      <input className="input" placeholder="Search units" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search units" />
      <div className="filters" role="tablist">
        {ROLES.map((r) => (
          <button key={r} className={`filter ${role === r ? 'on' : ''}`} onClick={() => setRole(r)} role="tab" aria-selected={role === r}>
            {r}
          </button>
        ))}
      </div>
      {!engine && <p className="muted">Loading units…</p>}
      <div className="card">
        {list.map((c) => {
          const n = inList(c.root.key);
          return (
            <button key={c.root.key} className="choice" onClick={() => add(c.root.key)}>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div className="muted small">
                  {c.cat}
                  {n ? ` · ${n} in list` : ''}
                </div>
              </span>
              <span className="num muted">{c.points}</span>
            </button>
          );
        })}
      </div>
      {engine && list.length === 0 && <p className="muted">No units match.</p>}
    </Screen>
  );
}
