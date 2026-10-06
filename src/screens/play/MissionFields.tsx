import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/data/db';
import { DISPOSITIONS, MISSION_DECK, ownPrimaries, primariesFor, toggleInList } from '@/engine/missions';
import { CardText, useMissionCards } from './missionCards';
import { DeploymentMap } from './deploymentMap';
import { LayoutPicker, LayoutPreview } from './layouts';

export interface MissionValue {
  mission?: string;
  deployment?: string;
  twist?: string;
  /** Your Force Disposition for this game (when the list doesn't set one, or to play another). */
  disposition?: string;
}

const SWAP_TWISTS = ['Scrambled Communications', 'Mirrored World'];
const pickRandom = <T,>(list: T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

/** Everything at random: a primary from your Force Disposition only, a deployment and a twist. */
export function randomMission(disposition?: string): MissionValue {
  return { mission: pickRandom(ownPrimaries(disposition)), deployment: pickRandom(MISSION_DECK.deployments), twist: pickRandom(MISSION_DECK.twists) };
}

/** Mission, deployment and twist from the current mission deck, each with its card text, plus saved layouts. */
export function MissionFields({ value, onChange, disposition: listDisposition, readOnly, primaryOnly }: { value: MissionValue; onChange: (v: MissionValue) => void; disposition?: string; readOnly?: boolean; primaryOnly?: boolean }) {
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layouts = useLiveQuery(() => db.layouts.toArray(), []);
  const cards = useMissionCards();
  const disposition = value.disposition || listDisposition;
  const own = ownPrimaries(disposition);
  // Only twists that swap or copy Primary Missions let you play another disposition's card.
  const swapTwist = SWAP_TWISTS.includes(value.twist ?? '');
  if (readOnly) {
    return (
      <>
        <p className="small">
          {[value.mission || 'Mission not set yet', value.deployment, value.twist].filter(Boolean).join(' · ')}
          <LayoutPreview name={value.deployment} />
        </p>
        <DeploymentMap name={value.deployment} />
        <CardText name={value.mission} cards={cards} compact />
        <CardText name={value.twist} cards={cards} compact />
      </>
    );
  }
  const dice = (onClick: () => void, label: string, disabled?: boolean) => (
    <button className="btn btn-sm btn-ghost" style={{ minHeight: 24, padding: 0 }} disabled={disabled} aria-label={label} onClick={(e) => (e.preventDefault(), onClick())}>
      🎲
    </button>
  );
  return (
    <>
      <label className="field">
        <span>Your Force Disposition{listDisposition && value.disposition && value.disposition !== listDisposition ? ` (your list: ${listDisposition})` : ''}</span>
        <select className="input" value={disposition ?? ''} onChange={(e) => onChange({ ...value, disposition: e.target.value || undefined, mission: ownPrimaries(e.target.value).includes(value.mission ?? '') ? value.mission : undefined })}>
          <option value="">Choose…</option>
          {DISPOSITIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      {!primaryOnly && (
        <button className="btn btn-sm" onClick={() => onChange({ ...value, ...randomMission(disposition) })} disabled={!disposition}>
          🎲 Randomise all (primary, deployment, twist)
        </button>
      )}
      {!disposition && <p className="small muted">Pick your Force Disposition first — your primary mission comes from its card.</p>}
      <label className="field">
        <span style={{ display: 'flex' }}>
          <span style={{ flex: 1 }}>Primary mission{disposition ? ` · ${disposition}` : ''}</span>
          {dice(() => onChange({ ...value, mission: pickRandom(own) }), 'Random primary mission', !own.length)}
        </span>
        <select className="input" value={value.mission ?? ''} onChange={(e) => onChange({ ...value, mission: e.target.value })}>
          <option value="">Choose…</option>
          {own.length > 0 && (
            <optgroup label={`${disposition} — the one under your opponent's symbol`}>
              {own.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </optgroup>
          )}
          {primariesFor(disposition)
            .filter((g) => g.disposition !== disposition && (swapTwist || !disposition))
            .map((g) => (
              <optgroup key={g.disposition} label={disposition ? `${g.disposition} (allowed by the ${value.twist} twist)` : g.disposition}>
                {g.missions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
            ))}
          {value.mission && !own.includes(value.mission) && !(swapTwist || !disposition) && <option value={value.mission}>{value.mission} (not your disposition)</option>}
          {value.mission && !Object.values(MISSION_DECK.primaries).flat().includes(value.mission) && <option value={value.mission}>{value.mission}</option>}
        </select>
      </label>
      <CardText name={value.mission} cards={cards} />
      {!primaryOnly && (
      <>
      <label className="field">
        <span style={{ display: 'flex' }}>
          <span style={{ flex: 1 }}>Deployment</span>
          {dice(() => onChange({ ...value, deployment: pickRandom(MISSION_DECK.deployments) }), 'Random deployment')}
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
          <option value="Other">Other</option>
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
      <DeploymentMap name={value.deployment} />
      <CardText name={value.deployment} cards={cards} compact />
      <button className="btn btn-sm" onClick={() => setLayoutOpen(true)}>
        Pick a saved layout photo
      </button>
      <LayoutPreview name={value.deployment} />
      <LayoutPicker open={layoutOpen} onClose={() => setLayoutOpen(false)} onPick={(name) => onChange({ ...value, deployment: name })} />
      <label className="field">
        <span style={{ display: 'flex' }}>
          <span style={{ flex: 1 }}>Twist</span>
          {dice(() => onChange({ ...value, twist: pickRandom(MISSION_DECK.twists) }), 'Random twist')}
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
      <CardText name={value.twist} cards={cards} />
      </>
      )}
      <p className="credit">Cards from the {MISSION_DECK.name} · card text powered by Wahapedia.</p>
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
