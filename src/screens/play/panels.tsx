import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Collapse } from '@/ui/Collapse';
import { PinButton, pinId } from '@/ui/PinButton';
import { NavLink } from 'react-router-dom';
import { db } from '@/data/db';
import { abilityInPhase, PHASE_NAMES, PHASES, type Phase } from '@/engine/game';
import type { UnitSummary } from '@/engine/live';
import { datasheet, unitModels } from '@/engine/rules/models';
import { catalogueChain } from '@/engine/bsdata/index';
import { armyRules, detachmentRules } from '@/engine/rules/armyRules';
import { ruleText } from '@/engine/rules/nodes';
import { RulesText } from '@/ui/RulesText';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import { sameName, stratagemFits, stratagemsFor, type ImportedRule } from '@/engine/wahapedia';
import { RuleLabel } from '@/ui/RuleLabel';
import { Icon } from '@/ui/Icon';
import { ConfirmSheet } from '@/ui/Sheet';
import { showToast } from '@/ui/Toast';
import { useRulePopup } from '@/ui/RulePopup';

/** Stratagems (from the import) and your abilities that apply in this phase and turn. */
export function PhasePanel({ engine, phase, myTurn, onSpend, cp }: { engine?: RosterEngine; phase: Phase; myTurn: boolean; onSpend: (s: ImportedRule, cost: number) => void; /** CP you have, to say what's left. */ cp?: number }) {
  const popup = useRulePopup();
  // The stratagem just used shows "✓ Used" on its button for a moment.
  const [used, setUsed] = useState<string>();
  useEffect(() => {
    if (!used) return;
    const t = setTimeout(() => setUsed(undefined), 2200);
    return () => clearTimeout(t);
  }, [used]);
  const spend = (s: ImportedRule, cost: number) => {
    onSpend(s, cost);
    setUsed(s.id);
    if (cp === undefined) showToast(`Used ${s.name} · ${cost} CP`);
    else if (cp < cost) showToast(`Used ${s.name} — but you only had ${cp} CP`);
    else showToast(`Used ${s.name} · ${cost} CP spent · ${cp - cost} CP left`);
  };
  const imported = useLiveQuery(() => db.imported.toArray(), []);
  const pins = useLiveQuery(() => db.pins.toArray(), []);
  const pinnedNames = useMemo(() => new Set((pins ?? []).filter((p) => p.kind === 'stratagem').map((p) => p.name.toLowerCase())), [pins]);
  const otherPins = (pins ?? []).filter((p) => p.kind !== 'stratagem' && p.kind !== 'datasheet');
  const index = engine?.index;
  const strats = useMemo(() => {
    if (!imported || !engine) return [];
    // Only your own faction (and the ones it builds on, e.g. Space Marines for Black Templars) — never the opponent's.
    const chain = catalogueChain(engine.index, engine.roster.catalogueId);
    // Allied catalogues (Agents of the Imperium…) count only when the list has a unit from them.
    const used = new Set(engine.roster.units.map((u) => engine.index.origin.get(engine.unitInst(u.id)?.node?.targetId ?? '') ?? ''));
    const own = chain.filter((c, i) => !c.library && (i === 0 || /space marines/i.test(c.name) || used.has(c.id)));
    const hints = [engine.roster.factionName, ...own.map((c) => c.name.split(' - ').pop() ?? '')];
    const list = stratagemsFor(imported, engine.roster.detachmentNames ?? [], hints).filter((s) => stratagemFits(s, phase, myTurn ? 'me' : 'them'));
    return list.sort((a, b) => Number(pinnedNames.has(b.name.toLowerCase())) - Number(pinnedNames.has(a.name.toLowerCase())));
  }, [imported, engine, phase, myTurn, pinnedNames]);
  const abilities = useMemo(() => {
    if (!engine) return [];
    const out: { unit: string; name: string; text: string }[] = [];
    for (const u of engine.roster.units) {
      const inst = engine.unitInst(u.id);
      if (!inst) continue;
      for (const a of datasheet(engine, inst).abilities) {
        const text = a.characteristics?.map((c) => c.$text ?? '').join('\n') ?? '';
        if (abilityInPhase(text, phase)) out.push({ unit: u.nickname || u.name, name: a.name, text });
      }
    }
    return out;
  }, [engine, phase]);
  const cpOf = (s: ImportedRule) => Number.parseInt(s.cp ?? '0', 10) || 0;
  const row = (s: ImportedRule, offPhase = false) => (
    <div key={s.id} className="row">
      <button
        className="kw"
        style={{ flex: 1, textAlign: 'left', textDecoration: 'none' }}
        onClick={() => popup.openDef({ name: s.name, text: s.text, kind: 'stratagem', source: `${cpOf(s)} CP · ${s.detachment ?? s.faction} · Wahapedia` }, index)}
      >
        <div style={{ fontWeight: 600, opacity: offPhase ? 0.7 : 1 }}>
          {pinnedNames.has(s.name.toLowerCase()) && <span className="tag">★ </span>}
          {s.name}
        </div>
        <div className="muted small">{[s.detachment ?? 'Core', offPhase ? s.phase : s.turn].filter(Boolean).join(' · ')}</div>
      </button>
      <PinButton small pin={{ id: pinId('stratagem', s.name), kind: 'stratagem', name: s.name, text: s.text, source: `${cpOf(s)} CP · ${s.detachment ?? s.faction}` }} />
      <button className={`btn btn-sm spend-btn ${used === s.id ? 'just-used' : ''}`} onClick={() => spend(s, cpOf(s))} aria-label={`Use ${s.name} for ${cpOf(s)} CP`}>
        {used === s.id ? '✓ Used' : `${cpOf(s)} CP`}
      </button>
    </div>
  );
  return (
    <>
      <div className="section-label">Your stratagems · {myTurn ? 'your turn' : "opponent's turn"}</div>
      {imported && imported.length === 0 && <p className="small muted">Get stratagems in Settings → Extra rules to see them here.</p>}
      <div className="card">
        {strats.map((s) => row(s))}
        {imported && imported.length > 0 && strats.length === 0 && <div className="row muted small">None for this phase.</div>}
      </div>
      <div className="section-label">Your abilities this phase</div>
      <div className="card">
        {abilities.map((a, i) => (
          <button key={i} className="choice" onClick={() => popup.openDef({ name: a.name, text: a.text, kind: 'ability', source: a.unit }, index)}>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{a.name}</div>
              <div className="muted small">{a.unit}</div>
            </span>
            <RuleLabel kind="ability" />
          </button>
        ))}
        {abilities.length === 0 && <div className="row muted small">Nothing mentions this phase.</div>}
      </div>
      {otherPins.length > 0 && (
        <>
          <div className="section-label">Pinned</div>
          <div className="card">
            {otherPins.map((p) => (
              <button key={p.id} className="choice" onClick={() => popup.openDef({ name: p.name, text: p.text ?? '', kind: p.kind, source: p.source ?? '' }, index)}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  {p.source && <div className="muted small">{p.source}</div>}
                </span>
                <RuleLabel kind={p.kind} />
              </button>
            ))}
          </div>
        </>
      )}
      {imported && imported.length > 0 && <p className="credit">Stratagems powered by Wahapedia.</p>}
    </>
  );
}

export interface UnitLeft {
  id: string;
  name: string;
  total: number;
  dead: number;
  /** Points of the unit and the characters leading it. */
  points: number;
  /** Wounds the unit has left and had at the start (removed models count 0; lost wounds come off). */
  woundsLeft: number;
  woundsTotal: number;
}

/** A unit's name: its nickname, the cached name, or (for a list shared as ids only) the data's name. */
export function unitName(engine: RosterEngine, u: { id: string; name: string; nickname?: string }): string {
  if (u.nickname || u.name) return u.nickname || u.name;
  const inst = engine.unitInst(u.id);
  return inst ? engine.ev.name(inst) : 'Unit';
}

/** Bodyguard units (with attached characters folded in), how many models are left and their points. */
export function unitsLeft(engine: RosterEngine, casualties: Record<string, string[]>, wounds: Record<string, number> = {}): UnitLeft[] {
  return engine.roster.units
    .filter((u) => !u.leaderOf || !engine.roster.units.some((b) => b.id === u.leaderOf))
    .map((u) => {
      const group = [u, ...engine.roster.units.filter((x) => x.leaderOf === u.id)];
      let total = 0;
      let dead = 0;
      let points = 0;
      let woundsLeft = 0;
      let woundsTotal = 0;
      for (const m of group) {
        const um = unitModels(engine, m.id, `${m.id}/`);
        const gone = new Set((casualties[m.id] ?? []).map((id) => `${m.id}/${id}`));
        total += um.models.length;
        dead += Math.min(um.models.length, casualties[m.id]?.length ?? 0);
        points += engine.unitPoints(m.id);
        for (const model of um.models) {
          const w = um.loadouts.find((l) => l.key === model.loadoutKey)?.wounds ?? 1;
          woundsTotal += w;
          // Wounds above full (a negative "lost") don't count past the model's own W.
          if (!gone.has(model.id)) woundsLeft += Math.max(0, w - Math.max(0, wounds[model.id] ?? 0));
        }
      }
      return { id: u.id, name: group.map((x) => unitName(engine, x)).join(' + '), total, dead, points, woundsLeft, woundsTotal };
    });
}

export const toSummaries = (list: UnitLeft[]): UnitSummary[] => list.map((u) => ({ name: u.name, alive: u.total - u.dead, total: u.total, points: u.points, w: u.woundsLeft, wt: u.woundsTotal }));

/** Share of an army's starting wounds still on the table (1 = untouched). */
export function healthOf(units: { woundsLeft?: number; woundsTotal?: number; w?: number; wt?: number }[]): number | undefined {
  const total = units.reduce((n, u) => n + (u.woundsTotal ?? u.wt ?? 0), 0);
  if (!total) return undefined;
  return units.reduce((n, u) => n + (u.woundsLeft ?? u.w ?? 0), 0) / total;
}

export function UnitsPanel({ gameId, units }: { gameId: string; units: UnitLeft[] }) {
  return (
    <div className="card">
      {units.map((u) => (
        <NavLink key={u.id} className={({ isActive }) => `unit-row${isActive ? ' active' : ''}`} to={`/play/${gameId}/unit/${u.id}`}>
          <span style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, textDecoration: u.dead >= u.total ? 'line-through' : undefined }}>{u.name}</div>
            <div className="muted small">
              {u.total - u.dead}/{u.total} models
            </div>
          </span>
          <span className="num muted small">{u.points} pts</span>
        </NavLink>
      ))}
    </div>
  );
}

export function SummaryList({ units }: { units: UnitSummary[] }) {
  return (
    <div className="card">
      {units.map((u, i) => (
        <div key={i} className="row">
          <span style={{ flex: 1, textDecoration: u.alive <= 0 ? 'line-through' : undefined }}>{u.name}</span>
          <span className="muted small">
            {u.alive}/{u.total}
            {u.points ? ` · ${u.points} pts` : ''}
          </span>
        </div>
      ))}
      {units.length === 0 && <div className="row muted small">No casualty info shared yet.</div>}
    </div>
  );
}

/** Your own notes for the whole game: tap to open or close; saved as you type. */
export function NotesPanel({ gameId, notes }: { gameId: string; notes?: string }) {
  const [text, setText] = useState(notes ?? '');
  useEffect(() => setText(notes ?? ''), [notes]);
  return (
    <Collapse title={`Notes${notes ? ' ·' : ''}`} defaultOpen={false} right={notes ? <span className="small muted" style={{ textTransform: 'none', letterSpacing: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notes.split('\n')[0]}</span> : undefined}>
      <textarea
        className="input"
        style={{ minHeight: 120 }}
        value={text}
        placeholder="Plans, reminders, what your opponent has in reserve…"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => db.games.update(gameId, { notes: text })}
        aria-label="Game notes"
      />
    </Collapse>
  );
}

/** Battle rounds 1–5 as buttons: tap one to jump to the start of that round. */
export function RoundBar({ round, onPick, disabled }: { round: number; onPick: (r: number) => void; disabled?: boolean }) {
  return (
    <div className="round-bar" role="group" aria-label="Battle round">
      {[1, 2, 3, 4, 5].map((r) => (
        <button key={r} className={r === round ? 'on' : r < round ? 'past' : undefined} aria-pressed={r === round} disabled={disabled && r !== round} onClick={() => r !== round && onPick(r)}>
          R{r}
        </button>
      ))}
    </div>
  );
}

/**
 * Your army's rules for the whole game: army rules (Oath of Moment…) and the
 * rules of your detachments, each a bar you open. Wahapedia's text is used
 * when it has the same rule (it follows new codexes sooner than the unit data).
 */
export function RulesPanel({ engine }: { engine?: RosterEngine }) {
  const imported = useLiveQuery(() => db.imported.where('kind').anyOf('armyRule', 'detachmentRule').toArray(), []);
  const index = engine?.index;
  const data = useMemo(() => {
    if (!engine) return undefined;
    const wpArmyRules = (imported ?? []).filter((r) => r.kind === 'armyRule');
    const faction = engine.roster.factionName;
    // Same name, ignoring punctuation ("Ka’tah" / "Ka'tah"); this army's own copy first.
    const wpFor = (name: string) => {
      const hits = wpArmyRules.filter((r) => sameName(r.name, name));
      return hits.find((r) => sameName(r.faction, faction)) ?? hits[0];
    };
    const army = armyRules(engine).map((r) => {
      const wp = wpFor(r.name);
      return { name: r.name, text: wp?.text ?? ruleText(r), wp: Boolean(wp) };
    });
    // Wahapedia lists more army rules for this faction than the unit data links (e.g. Dark Pacts for Thousand Sons).
    const generic = /^(special move types|designer.s note|super-heavy walker|leader|support|deep strike|scouts|infiltrators|stealth|lone operative|feel no pain|deadly demise|fights first|hover|firing deck|damaged)$/i;
    const more = wpArmyRules
      .filter((r) => sameName(r.faction, faction) && !generic.test(r.name) && !army.some((a) => sameName(a.name, r.name)))
      .map((r) => ({ name: r.name, text: r.text, wp: true }));
    const dets = engine.roster.detachmentNames ?? [];
    const wpDet = (imported ?? []).filter((r) => r.kind === 'detachmentRule' && dets.some((d) => sameName(d, r.detachment ?? '')));
    const fromData = detachmentRules(engine);
    const detRules = dets.map((d) => {
      const wp = wpDet.filter((r) => sameName(r.detachment ?? '', d));
      return { detachment: d, rules: wp.length ? wp.map((r) => ({ name: r.name, text: r.text, wp: true })) : fromData.filter((r) => r.detachment === d).map((r) => ({ name: r.name, text: r.text, wp: false })) };
    });
    return { army, more, detRules };
  }, [engine, imported]);
  if (!data) return <p className="muted">Loading…</p>;
  const item = (r: { name: string; text: string; wp: boolean }, key: string, open = false) => (
    <Collapse key={key} title={r.name} tone="plain" defaultOpen={open}>
      <RulesText text={r.text} index={index} />
      {r.wp && <p className="credit">Powered by Wahapedia</p>}
    </Collapse>
  );
  return (
    <div>
      <div className="section-label">Army rules</div>
      <div className="card" style={{ padding: '0 12px' }}>
        {data.army.map((r) => item(r, `a-${r.name}`, data.army.length === 1))}
        {data.army.length === 0 && data.more.length === 0 && <div className="row muted small">No army rules found in the data.</div>}
      </div>
      {data.more.length > 0 && (
        <>
          <div className="section-label">More {engine?.roster.factionName} army rules · check which apply</div>
          <div className="card" style={{ padding: '0 12px' }}>
            {data.more.map((r) => item(r, `m-${r.name}`))}
          </div>
        </>
      )}
      {data.detRules.map((d) => (
        <div key={d.detachment}>
          <div className="section-label">{d.detachment}</div>
          <div className="card" style={{ padding: '0 12px' }}>
            {d.rules.map((r) => item(r, `d-${d.detachment}-${r.name}`, d.rules.length === 1))}
            {d.rules.length === 0 && <div className="row muted small">No rules text for this detachment in the data.</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Big bar saying whose turn it is: your colour on your turn, a cold grey on
 * theirs. Tapping it offers to hand the turn over (with a confirmation, so a
 * stray tap mid-game doesn't skip anyone's turn).
 */
export function TurnBanner({ mine, label, phase, vp, onSwitch, switchTo }: { mine: boolean; label: string; phase: string; vp: string; onSwitch?: () => void; switchTo?: string }) {
  const [ask, setAsk] = useState(false);
  // When the turn passes: a short callout in the middle of the screen, a pulse on the banner,
  // and a buzz when it's your turn now.
  const prev = useRef(label);
  const [flash, setFlash] = useState<string>();
  useEffect(() => {
    if (prev.current === label) return;
    prev.current = label;
    setFlash(label);
    if (mine) navigator.vibrate?.(80);
    const t = setTimeout(() => setFlash(undefined), 1700);
    return () => clearTimeout(t);
  }, [label, mine]);
  return (
    <>
      {flash &&
        createPortal(
          <div className={`turn-callout ${mine ? 'mine' : 'theirs'}`} role="status" aria-live="assertive">
            <div className="turn-callout-who">{flash}</div>
            <div className="turn-callout-phase">{phase} phase</div>
          </div>,
          document.body,
        )}
      <button
        type="button"
        className={`turn-banner ${mine ? 'mine' : 'theirs'} ${flash ? 'turn-flash' : ''}`}
        aria-live="polite"
        onClick={() => onSwitch && setAsk(true)}
        disabled={!onSwitch}
        aria-label={`${label}, ${phase} phase, VP ${vp}${onSwitch ? '. Tap to hand the turn over' : ''}`}
      >
        <span className="turn-banner-who">{label}</span>
        <span className="turn-banner-phase">{phase}</span>
        <span className="turn-banner-vp num">VP {vp}</span>
        {onSwitch && (
          <span className="turn-banner-swap" aria-hidden="true">
            <Icon name="swap" size={18} />
          </span>
        )}
      </button>
      <ConfirmSheet
        open={ask}
        onClose={() => setAsk(false)}
        title={switchTo ? `Hand the turn to ${switchTo}?` : 'Hand the turn over?'}
        message="Their turn starts at the Command phase. Use this when someone forgot to press Next; otherwise Next moves through the phases for you."
        confirm="Hand over the turn"
        onConfirm={() => onSwitch?.()}
      />
    </>
  );
}

const SHORT_PHASE: Record<Phase, string> = { command: 'Cmd', movement: 'Move', shooting: 'Shoot', charge: 'Charge', fight: 'Fight' };

/** The five phases as one row that always fits the screen (short names on very narrow phones). `current` gets a dot. */
export function PhaseStrip({ value, current, onPick, label }: { value: Phase; current?: Phase; onPick: (p: Phase) => void; label?: string }) {
  return (
    <div className="phase-strip" role="group" aria-label={label ?? 'Phase'}>
      {PHASES.map((p) => (
        <button key={p} className={`filter ${value === p ? 'on' : ''}`} aria-pressed={value === p} aria-label={PHASE_NAMES[p]} onClick={() => onPick(p)}>
          <span className="phase-full">{PHASE_NAMES[p]}</span>
          <span className="phase-short">{SHORT_PHASE[p]}</span>
          {current === p && current !== value ? <span className="phase-dot" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}
