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
const pickRandom = <T,>(list: T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

/** A whole mission at random: primary for the Force Disposition, a deployment and (half the time) a twist. */
export function randomMission(disposition?: string): MissionValue {
  const primaries = disposition && MISSION_DECK.primaries[disposition] ? MISSION_DECK.primaries[disposition]! : Object.values(MISSION_DECK.primaries).flat();
  return { mission: pickRandom(primaries), deployment: pickRandom(MISSION_DECK.deployments), twist: pickRandom(MISSION_DECK.twists) };
}

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
      <button className="btn btn-sm" onClick={() => onChange(randomMission(disposition))}>
        🎲 Random mission
      </button>
      <label className="field">
        <span style={{ display: 'flex' }}>
          <span style={{ flex: 1 }}>Primary mission{disposition ? ` (yours first: ${disposition})` : ''}</span>
          <button className="btn btn-sm btn-ghost" style={{ minHeight: 24, padding: 0 }} onClick={(e) => (e.preventDefault(), onChange({ ...value, mission: randomMission(disposition).mission }))}>
            🎲
          </button>
        </span>
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
        <span style={{ display: 'flex' }}>
          <span style={{ flex: 1 }}>Deployment</span>
          <button className="btn btn-sm btn-ghost" style={{ minHeight: 24, padding: 0 }} onClick={(e) => (e.preventDefault(), onChange({ ...value, deployment: pickRandom(MISSION_DECK.deployments) }))}>
            🎲
          </button>
        </span>
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
        <span style={{ display: 'flex' }}>
          <span style={{ flex: 1 }}>Twist</span>
          <button className="btn btn-sm btn-ghost" style={{ minHeight: 24, padding: 0 }} onClick={(e) => (e.preventDefault(), onChange({ ...value, twist: pickRandom(MISSION_DECK.twists) }))}>
            🎲
          </button>
        </span>
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

/**
 * Secondary missions: tap to choose, at most two active at a time (as in the
 * mission rules), or draw two at random (Tactical).
 */
export function SecondaryPicker({ value, onChange, max = 2 }: { value: string; onChange: (v: string) => void; max?: number }) {
  const chosen = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set(chosen);
  const full = chosen.length >= max;
  const draw = () => {
    const pool = MISSION_DECK.secondaries.filter((s) => !set.has(s));
    const keep = chosen.slice(0, Math.max(0, max - 2));
    const picks: string[] = [];
    while (picks.length < Math.min(2, max) && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
    onChange([...keep, ...picks].join(', '));
  };
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
        <span className="small muted" style={{ flex: 1 }}>
          {chosen.length}/{max} active{full ? ' — tap one to swap it out' : ''}
        </span>
        <button className="btn btn-sm" onClick={draw}>
          🎲 Draw {max}
        </button>
      </div>
      <div className="kw-list" style={{ gap: '6px 14px', margin: '6px 0 10px' }}>
        {MISSION_DECK.secondaries.map((s) => (
          <button key={s} className={`filter ${set.has(s) ? 'on' : ''}`} disabled={full && !set.has(s)} style={full && !set.has(s) ? { opacity: 0.4 } : undefined} onClick={() => onChange(toggleInList(value, s))}>
            {s}
          </button>
        ))}
      </div>
    </>
  );
}
