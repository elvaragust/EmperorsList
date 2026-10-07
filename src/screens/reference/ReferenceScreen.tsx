import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { useAllIndex } from '@/data/gameData';
import type { RuleKind } from '@/engine/types';
import { buildDocs, type RefDoc } from '@/search/buildDocs';
import { createSearch } from '@/search/searchIndex';
import { RuleLabel } from '@/ui/RuleLabel';
import { useRulePopup } from '@/ui/RulePopup';
import { Screen } from '@/ui/Screen';
import { PinButton, pinId } from '@/ui/PinButton';
import { Collapse } from '@/ui/Collapse';

const KINDS: { kind: RuleKind; label: string }[] = [
  { kind: 'stratagem', label: 'Stratagems' },
  { kind: 'datasheet', label: 'Units' },
  { kind: 'ability', label: 'Abilities' },
  { kind: 'enhancement', label: 'Enhancements' },
  { kind: 'detachment', label: 'Detachments' },
  { kind: 'army', label: 'Army rules' },
  { kind: 'core', label: 'Core' },
  { kind: 'weaponAbility', label: 'Weapon abilities' },
  { kind: 'keyword', label: 'Keywords' },
];

export function ReferenceScreen() {
  const navigate = useNavigate();
  const popup = useRulePopup();
  const { index, error } = useAllIndex();
  const imported = useLiveQuery(() => db.imported.toArray(), []);
  const files = useLiveQuery(() => db.dataMeta.toArray(), []);
  const pins = useLiveQuery(() => db.pins.orderBy('createdAt').reverse().toArray(), []);
  const [q, setQ] = useState('');
  const [kinds, setKinds] = useState<RuleKind[]>([]);

  const docs = useMemo(() => (index && imported ? buildDocs(index, imported) : []), [index, imported]);
  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const search = useMemo(() => createSearch(docs), [docs]);
  const hits = useMemo(() => search(q, kinds).slice(0, 80), [search, q, kinds]);
  // Browsing by kind (filters on, nothing typed): everything of those kinds, grouped by faction.
  const browse = useMemo(() => {
    if (!kinds.length || q.trim()) return [];
    const groups = new Map<string, RefDoc[]>();
    for (const d of docs) {
      if (!kinds.includes(d.kind)) continue;
      const g = d.group || d.source || 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(d);
    }
    const first = (g: string) => (/^core/i.test(g) ? 0 : /keyword/i.test(g) ? 2 : 1);
    return [...groups.entries()]
      .map(([name, items]) => ({ name, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => first(a.name) - first(b.name) || a.name.localeCompare(b.name));
  }, [docs, kinds, q]);
  const factions = (files ?? []).filter((f) => !f.library && !f.gameSystem && f.catalogueId).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  const open = (id: string) => {
    const d = byId.get(id) as RefDoc | undefined;
    if (!d) return;
    if (d.route) navigate(d.route);
    else popup.openDef({ name: d.name, text: d.text, kind: d.kind, source: d.source }, index, d.extra ? <p className="muted small">{d.extra}</p> : undefined);
  };

  const row = (h: { id: string; kind: RuleKind; name: string; text: string; source: string }) => (
    <div key={h.id} className="result-row">
      <button className="choice" onClick={() => open(h.id)}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong>{h.name}</strong>
            <RuleLabel kind={h.kind} />
          </div>
          <div className="muted small">{h.source}</div>
          {h.text && (
            <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
              {h.text.replace(/\^\^|\*\*/g, '').slice(0, 140)}
            </div>
          )}
        </span>
      </button>
      <PinButton small pin={{ id: pinId(h.kind, h.name), kind: h.kind, name: h.name, text: h.text, source: h.source, route: (byId.get(h.id) as RefDoc | undefined)?.route }} />
    </div>
  );

  const toggle = (k: RuleKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <Screen
      title="Reference"
      actions={
        <Link className="btn btn-sm btn-ghost" to="/reference/pinned" aria-label="Pinned">
          ★ {pins?.length ? pins.length : ''}
        </Link>
      }
    >
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rules, units, stratagems…" aria-label="Search" />
      <div className="filters">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            className={`filter ${kinds.includes(k.kind) ? 'on' : ''}`}
            style={{ '--filter-color': `var(--rule-${k.kind})` } as CSSProperties}
            onClick={() => toggle(k.kind)}
            aria-pressed={kinds.includes(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>
      {error && <p className="muted">{error}</p>}
      {!index && !error && <p className="muted">Loading the downloaded data…</p>}
      {index && files && files.length === 0 && <p className="muted">Nothing downloaded yet. Create a list or open Settings → Data.</p>}

      {q.trim() ? (
        <div className="card">
          {hits.map(row)}
          {hits.length === 0 && <div className="row muted">No matches.</div>}
        </div>
      ) : kinds.length ? (
        <>
          <div className="section-label">
            {KINDS.filter((k) => kinds.includes(k.kind)).map((k) => k.label).join(' + ')} · {browse.reduce((n, g) => n + g.items.length, 0)}
          </div>
          {browse.map((g) => (
            <Collapse key={g.name} title={g.name} right={<span className="muted small num" style={{ padding: '0 4px' }}>{g.items.length}</span>}>
              <div className="card">{g.items.map(row)}</div>
            </Collapse>
          ))}
          {browse.length === 0 && <p className="muted">Nothing of this kind in the downloaded data{kinds.includes('stratagem') ? ' — stratagems load from Wahapedia on the hosted app' : ''}.</p>}
          <button className="btn btn-block btn-ghost" style={{ marginTop: 10 }} onClick={() => setKinds([])}>
            Clear filters
          </button>
        </>
      ) : (
        <>
          {pins && pins.length > 0 && (
            <>
              <div className="section-label">Pinned</div>
              <div className="card">
                {pins.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--line-soft)' }}>
                    <button
                      className="choice"
                      style={{ borderTop: 0, flex: 1 }}
                      onClick={() => (p.route ? navigate(p.route) : popup.openDef({ name: p.name, text: p.text ?? '', kind: p.kind, source: p.source ?? '' }, index))}
                    >
                      <span style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        {p.source && <div className="muted small">{p.source}</div>}
                      </span>
                      <RuleLabel kind={p.kind} />
                    </button>
                    <PinButton small pin={p} />
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="section-label">Browse</div>
          <div className="card" style={{ marginBottom: 10 }}>
            <Link className="choice" to="/reference/core">
              <span style={{ flex: 1 }}>Core rules A–Z</span>
              <RuleLabel kind="core" />
            </Link>
          </div>
          {alliances(factions).map((g) => (
            <Collapse key={g.name} title={g.name} right={<span className="muted small num" style={{ padding: '0 4px' }}>{g.items.length}</span>}>
              <div className="card">
                {g.items.map((f) => (
                  <Link key={f.path} className="choice" to={`/reference/faction/${f.catalogueId}`}>
                    <span style={{ flex: 1 }}>{(f.name ?? f.path).replace(/^(Imperium|Chaos|Xenos|Aeldari) - (Adeptus Astartes - )?/, '')}</span>
                    <span className="muted small">Faction</span>
                  </Link>
                ))}
              </div>
            </Collapse>
          ))}
          {imported && imported.length === 0 && (
            <p className="muted small" style={{ marginTop: 14 }}>
              Stratagems come from Wahapedia and load automatically on the hosted app. Running locally? Import the CSV files in Settings → Extra rules.
            </p>
          )}
          {imported && imported.length > 0 && <p className="credit">Stratagems powered by Wahapedia ({imported.length} imported).</p>}
        </>
      )}
    </Screen>
  );
}

/** Factions under Imperium / Chaos / Xenos / Aeldari headings, like the official app. */
function alliances<T extends { name?: string; path: string }>(factions: T[]): { name: string; items: T[] }[] {
  const order = ['Imperium', 'Space Marines', 'Chaos', 'Aeldari', 'Xenos'];
  const groups = new Map<string, T[]>();
  for (const f of factions) {
    const n = f.name ?? f.path;
    const g = /Adeptus Astartes/.test(n) ? 'Space Marines' : (/^(Imperium|Chaos|Xenos|Aeldari) - /.exec(n)?.[1] ?? 'Xenos');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(f);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items })).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}
