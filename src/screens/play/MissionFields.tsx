import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/data/db';
import { MISSION_DECK, primariesFor, toggleInList } from '@/engine/missions';
import { LayoutPicker, LayoutPreview } from './layouts';

export interface MissionValue {
  mission?: string;
  deployment?: string;
  twist?: string;
}

/** Mission, deployment and twist from the current mission deck (or typed in), plus saved layouts. */
export function MissionFields({ value, onChange, disposition, readOnly }: { value: MissionValue; onChange: (v: MissionValue) => void; disposition?: string; readOnly?: boolean }) {
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layouts = useLiveQuery(() => db.layouts.toArray(), []);
  if (readOnly) {
    return (
      <p className="small">
        {[value.mission || 'Mission not set yet', value.deployment, value.twist].filter(Boolean).join(' · ')}
        <LayoutPreview name={value.deployment} />
      </p>
    );
  }
  return (
    <>
      <label className="field">
        <span>Primary mission{disposition ? ` (yours first: ${disposition})` : ''}</span>
        <select className="input" value={value.mission ?? ''} onChange={(e) => onChange({ ...value, mission: e.target.value })}>
          <option value="">Choose…</option>
          {primariesFor(disposition).map((g) => (
            <optgroup key={g.disposition} label={g.disposition}>
              {g.missions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </optgroup>
          ))}
          {value.mission && !Object.values(MISSION_DECK.primaries).flat().includes(value.mission) && <option value={value.mission}>{value.mission}</option>}
        </select>
      </label>
      <label className="field">
        <span>Deployment</span>
        <select className="input" value={value.deployment ?? ''} onChange={(e) => onChange({ ...value, deployment: e.target.value })}>
          <option value="">Choose…</option>
          <optgroup label="Mission deck">
            {MISSION_DECK.deployments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </optgroup>
          {layouts && layouts.length > 0 && (
            <optgroup label="Your saved layouts">
              {layouts.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <button className="btn btn-sm" onClick={() => setLayoutOpen(true)}>
        Pick a saved layout photo
      </button>
      <LayoutPreview name={value.deployment} />
      <LayoutPicker open={layoutOpen} onClose={() => setLayoutOpen(false)} onPick={(name) => onChange({ ...value, deployment: name })} />
      <label className="field">
        <span>Twist</span>
        <select className="input" value={value.twist ?? ''} onChange={(e) => onChange({ ...value, twist: e.target.value })}>
          <option value="">None</option>
          {MISSION_DECK.twists.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <p className="small muted">
        Card names from the {MISSION_DECK.name}.{' '}
        <a className="tag" href={MISSION_DECK.url} target="_blank" rel="noreferrer">
          READ THE CARDS ON WAHAPEDIA ↗
        </a>
      </p>
    </>
  );
}

/** Tap secondary missions to add or remove them from a text field. */
export function SecondaryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const chosen = new Set(
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return (
    <div className="kw-list" style={{ gap: '6px 14px', margin: '6px 0 10px' }}>
      {MISSION_DECK.secondaries.map((s) => (
        <button key={s} className={`filter ${chosen.has(s) ? 'on' : ''}`} onClick={() => onChange(toggleInList(value, s))}>
          {s}
        </button>
      ))}
    </div>
  );
}
