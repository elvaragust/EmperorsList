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
import { PinButton } from '@/ui/PinButton';

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
  const files = useLiveQuery(() => db.dataFiles.toArray(), []);
  const pins = useLiveQuery(() => db.pins.orderBy('createdAt').reverse().toArray(), []);
  const [q, setQ] = useState('');
  const [kinds, setKinds] = useState<RuleKind[]>([]);

  const docs = useMemo(() => (index && imported ? buildDocs(index, imported) : []), [index, imported]);
  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const search = useMemo(() => createSearch(docs), [docs]);
  const hits = useMemo(() => search(q, kinds).slice(0, 80), [search, q, kinds]);
  const factions = (files ?? []).filter((f) => !f.library && !f.gameSystem && f.catalogueId).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  const open = (id: string) => {
    const d = byId.get(id) as RefDoc | undefined;
    if (!d) return;
    if (d.route) navigate(d.route);
    else popup.openDef({ name: d.name, text: d.text, kind: d.kind, source: d.source }, index, d.extra ? <p className="muted small">{d.extra}</p> : undefined);
  };

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
          {hits.map((h) => (
            <button key={h.id} className="choice" onClick={() => open(h.id)} style={{ alignItems: 'flex-start' }}>
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
          ))}
          {hits.length === 0 && <div className="row muted">No matches.</div>}
        </div>
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
          <div className="card">
            <Link className="choice" to="/reference/core">
              <span style={{ flex: 1 }}>Core rules A–Z</span>
              <RuleLabel kind="core" />
            </Link>
            {factions.map((f) => (
              <Link key={f.path} className="choice" to={`/reference/faction/${f.catalogueId}`}>
                <span style={{ flex: 1 }}>{(f.name ?? f.path).replace(/^(Imperium|Chaos|Xenos|Aeldari) - (Adeptus Astartes - )?/, '')}</span>
                <span className="muted small">Faction</span>
              </Link>
            ))}
          </div>
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
