import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/data/db';
import { DISPOSITIONS, MISSION_DECK, primaryFor, primaryOptions, toggleInList } from '@/engine/missions';
import { CardText, useMissionCards } from './missionCards';
import { DeploymentMap } from './deploymentMap';
import { LayoutPicker, LayoutPreview } from './layouts';

export interface MissionValue {
  mission?: string;
  deployment?: string;
  twist?: string;
  /** Your Force Disposition for this game (when the list doesn't set one, or to play another). */
  disposition?: string;
  /** The opponent's Force Disposition: with yours, it decides your primary mission. */
  opponentDisposition?: string;
  /** The primary was picked by hand instead of from the two dispositions. */
  manualPrimary?: boolean;
}

const pickRandom = <T,>(list: T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

/** Deployment and twist at random (the primary follows from the dispositions). */
export function randomMission(): MissionValue {
  return { deployment: pickRandom(MISSION_DECK.deployments), twist: pickRandom(MISSION_DECK.twists) };
}

/** The primary a value gives: picked by hand, or your card under their symbol. */
export const primaryOf = (v: MissionValue) => (v.manualPrimary ? v.mission : primaryFor(v.disposition, v.opponentDisposition) ?? v.mission);

/**
 * Force Dispositions, primary mission, deployment and twist, each with its
 * card text, plus saved layouts. Your primary is the mission on your Force
 * Disposition card under your opponent's symbol, so it's worked out once both
 * are known — or pick missions by hand.
 */
export function MissionFields({
  value,
  onChange,
  disposition: listDisposition,
  readOnly,
  primaryOnly,
  allowed,
  opponents,
  teamNote,
}: {
  value: MissionValue;
  onChange: (v: MissionValue) => void;
  disposition?: string;
  readOnly?: boolean;
  primaryOnly?: boolean;
  /** Force Dispositions you may pick (in a team game: what either teammate's list allows). All when unknown. */
  allowed?: string[];
  /** Live game: the other players and their dispositions (read only). Without it the opponent's is picked here. */
  opponents?: { name: string; disposition?: string }[];
  /** e.g. "Your team plays one disposition" */
  teamNote?: string;
}) {
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layouts = useLiveQuery(() => db.layouts.toArray(), []);
  const cards = useMissionCards();
  const disposition = value.disposition || listDisposition;
  const theirs = opponents ? [...new Set(opponents.map((o) => o.disposition).filter(Boolean) as string[])] : value.opponentDisposition ? [value.opponentDisposition] : [];
  const oppDisposition = theirs.length === 1 ? theirs[0] : undefined;
  const auto = primaryFor(disposition, oppDisposition);
  const primary = value.manualPrimary ? value.mission : auto;
  // Keep `mission` in step with the dispositions unless it was picked by hand.
  const change = (v: MissionValue) => {
    const d = v.disposition || listDisposition;
    const opp = opponents ? oppDisposition : v.opponentDisposition;
    onChange(v.manualPrimary ? v : { ...v, mission: primaryFor(d, opp) });
  };
  const choices = primaryOptions(allowed ?? [], oppDisposition);
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
        <select className="input" value={disposition ?? ''} onChange={(e) => change({ ...value, disposition: e.target.value || undefined })}>
          <option value="">Choose…</option>
          {DISPOSITIONS.filter((d) => !allowed?.length || allowed.includes(d) || d === disposition).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      {teamNote && <p className="small muted" style={{ marginTop: -4 }}>{teamNote}</p>}
      {opponents ? (
        <p className="small" style={{ margin: '4px 0 8px' }}>
          {opponents.map((o) => `${o.name}: ${o.disposition ?? 'not chosen yet'}`).join(' · ')}
        </p>
      ) : (
        <label className="field">
          <span>Opponent's Force Disposition</span>
          <select className="input" value={value.opponentDisposition ?? ''} onChange={(e) => change({ ...value, opponentDisposition: e.target.value || undefined })}>
            <option value="">Not revealed yet</option>
            {DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="disp-table" role="group" aria-label="Your dispositions and the primary each gives">
        <div className="disp-head small muted">{oppDisposition ? `Against ${oppDisposition}, each disposition you can play gives:` : 'Dispositions you can play'}</div>
        {choices.map((c) => (
          <button key={c.disposition} className={`disp-row ${c.disposition === disposition ? 'on' : ''}`} aria-pressed={c.disposition === disposition} onClick={() => change({ ...value, disposition: c.disposition })}>
            <span className="disp-name">{c.disposition}</span>
            <span className="disp-primary">{c.primary ?? (oppDisposition ? '—' : 'needs their disposition')}</span>
          </button>
        ))}
        {opponents && theirs.length > 1 && <p className="small muted">Your opponents play different dispositions — pick your primary by hand below.</p>}
      </div>

      <div className="section-label" style={{ marginTop: 10 }}>
        Primary mission
      </div>
      {!value.manualPrimary && (
        <p className="small" style={{ marginTop: 0 }}>
          {auto ? (
            <>
              <strong>{auto}</strong> — on your {disposition} card under the {oppDisposition} symbol.
            </>
          ) : (
            <span className="muted">{disposition ? "Set your opponent's disposition to see your primary." : 'Pick your Force Disposition first — your primary comes from its card.'}</span>
          )}
        </p>
      )}
      <button className="choice" role="switch" aria-checked={Boolean(value.manualPrimary)} onClick={() => change({ ...value, manualPrimary: !value.manualPrimary, mission: !value.manualPrimary ? primary : undefined })}>
        <span style={{ flex: 1 }}>
          Pick missions by hand
          <div className="muted small">Any primary mission, e.g. for a twist that swaps primaries or your own mission</div>
        </span>
        <span className={`switch ${value.manualPrimary ? 'on' : ''}`} aria-hidden="true" />
      </button>
      {value.manualPrimary && (
        <label className="field">
          <span style={{ display: 'flex' }}>
            <span style={{ flex: 1 }}>Primary mission</span>
            {dice(() => change({ ...value, mission: pickRandom(Object.values(MISSION_DECK.primaries).flat()) }), 'Random primary mission')}
          </span>
          <select className="input" value={value.mission ?? ''} onChange={(e) => change({ ...value, mission: e.target.value || undefined })}>
            <option value="">Choose…</option>
            {Object.entries(MISSION_DECK.primaries).map(([d, missions]) => (
              <optgroup key={d} label={d}>
                {missions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
            ))}
            {value.mission && !Object.values(MISSION_DECK.primaries).flat().includes(value.mission) && <option value={value.mission}>{value.mission}</option>}
          </select>
          <input className="input" style={{ marginTop: 6 }} placeholder="…or type a mission name" defaultValue="" onBlur={(e) => e.target.value.trim() && change({ ...value, mission: e.target.value.trim() })} />
        </label>
      )}
      <CardText name={primary} cards={cards} />
      {!primaryOnly && (
        <>
          <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => change({ ...value, ...randomMission() })}>
            🎲 Random deployment and twist
          </button>
          <label className="field">
            <span style={{ display: 'flex' }}>
              <span style={{ flex: 1 }}>Deployment</span>
              {dice(() => change({ ...value, deployment: pickRandom(MISSION_DECK.deployments) }), 'Random deployment')}
            </span>
            <select className="input" value={value.deployment ?? ''} onChange={(e) => change({ ...value, deployment: e.target.value })}>
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
          <LayoutPicker open={layoutOpen} onClose={() => setLayoutOpen(false)} onPick={(name) => change({ ...value, deployment: name })} />
          <label className="field">
            <span style={{ display: 'flex' }}>
              <span style={{ flex: 1 }}>Twist</span>
              {dice(() => change({ ...value, twist: pickRandom(MISSION_DECK.twists) }), 'Random twist')}
            </span>
            <select className="input" value={value.twist ?? ''} onChange={(e) => change({ ...value, twist: e.target.value })}>
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
