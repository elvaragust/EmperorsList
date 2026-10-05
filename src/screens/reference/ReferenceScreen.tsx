import { useMemo, useState } from 'react';
import { createSearch, type SearchDoc } from '@/search/searchIndex';
import { RuleLabel } from '@/ui/RuleLabel';
import { Screen } from '@/ui/Screen';

/**
 * Placeholder documents written for the demo. Once a data pack is downloaded,
 * the index is built from its rules, profiles and stratagems instead.
 */
const DEMO_DOCS: SearchDoc[] = [
  { id: 'lh', kind: 'weaponAbility', name: 'Lethal Hits', text: 'A critical hit wounds automatically.', source: 'Core Rules' },
  { id: 'ch', kind: 'core', name: 'Critical Hit', text: 'An unmodified hit roll of 6; Lethal Hits triggers on it.', source: 'Core Rules' },
  { id: 'tp', kind: 'ability', name: 'Tactical Precision', text: 'Weapons in the led unit have Lethal Hits.', source: 'Lieutenant' },
  { id: 'inf', kind: 'keyword', name: 'Infantry', text: 'Unit keyword.', source: 'Keywords' },
];

export function ReferenceScreen() {
  const search = useMemo(() => createSearch(DEMO_DOCS), []);
  const [q, setQ] = useState('lethal');
  const hits = search(q);

  return (
    <Screen title="Reference">
      <label className="section-label" htmlFor="q">
        Search rules, units, stratagems
      </label>
      <input
        id="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: '100%', height: 48, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--raised)', padding: '0 14px' }}
      />
      <div className="section-label">{hits.length} results · closest match first</div>
      <div className="card">
        {hits.map((h) => (
          <div className="row" key={h.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <RuleLabel kind={h.kind} />
            <div style={{ fontWeight: 600 }}>{h.name}</div>
            <div className="muted small">{h.text}</div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
