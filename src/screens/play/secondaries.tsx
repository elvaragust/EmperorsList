import { useState } from 'react';
import type { SavedGame } from '@/data/db';
import { Sheet } from '@/ui/Sheet';
import { applySecOp, fixedSecondaries, MISSION_DECK, secondariesFor, shuffled, type SecOp, type SecondaryState } from '@/engine/missions';
import { Icon } from '@/ui/Icon';
import { showToast } from '@/ui/Toast';
import { cardTags, MissionRow, ScoreCard, useMissionCards, type CardInfo } from './missionCards';

type Mode = 'fixed' | 'tactical';
const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** A local game's own missions, kept on the saved game (older fields), as one state. */
export function localSecondaries(g: SavedGame): SecondaryState {
  return { mode: g.secondaryMode?.me, fixed: list(g.secondaries?.me), tactical: g.tactical, primaryDone: g.primaryDone, primaryParts: g.primaryParts, secParts: g.secParts };
}

/** Write a missions state back onto a local game. */
export function localSecondariesPatch(g: SavedGame, s: SecondaryState): Partial<SavedGame> {
  return {
    secondaryMode: { ...g.secondaryMode, me: s.mode },
    secondaries: { me: s.fixed.join(', '), them: g.secondaries?.them ?? '' },
    tactical: s.tactical,
    primaryDone: s.primaryDone,
    primaryParts: s.primaryParts,
    secParts: s.secParts,
  };
}

/** Apply a missions change to a local game (the latest saved copy). */
export function applyLocalSec(g: SavedGame, op: SecOp): Partial<SavedGame> {
  return localSecondariesPatch(g, applySecOp(localSecondaries(g), op));
}

/** Choosing Tactical: a freshly shuffled deck of the cards this side may use. */
export function tacticalOp(role: SavedGame['role'], cards: Map<string, CardInfo>): SecOp {
  const tags = cardTags(cards);
  return { op: 'mode', mode: 'tactical', deck: shuffled(secondariesFor(role, tags.size ? tags : undefined)) };
}

/** How the two ways of playing secondaries work (mission deck rules, summarised). */
export function ModeRules({ mode }: { mode: Mode }) {
  return mode === 'fixed' ? (
    <ul className="small rules-list">
      <li>Before the battle, pick <strong>2 Fixed</strong> cards and show them to your opponent.</li>
      <li>They stay active all game and can't be discarded.</li>
      <li>Up to <strong>20VP</strong> from each Fixed card; at most 15VP from secondaries per battle round, 45VP per game.</li>
    </ul>
  ) : (
    <ul className="small rules-list">
      <li>Shuffle your Secondary Missions deck.</li>
      <li>
        <strong>Start of your Command phase:</strong> open <strong>Secondaries</strong> and tap <strong>Draw secondary</strong> once for each card you draw. Tap a drawn card again to put it back. Cards you haven't scored stay in your hand.
      </li>
      <li>
        <strong>End of your turn:</strong> tick what you achieved on a card: its VP is added straight away and the card is scored (untick to take it back). You may discard any others.
      </li>
      <li>At most 15VP from secondaries per battle round, 45VP per game.</li>
    </ul>
  );
}

function ModeSwitch({ value, onChange, disabled }: { value?: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  return (
    <div className="seg" role="radiogroup" style={{ margin: '6px 0' }}>
      {(['fixed', 'tactical'] as const).map((m) => (
        <button key={m} role="radio" aria-checked={value === m} className={value === m ? 'on' : undefined} disabled={disabled} onClick={() => onChange(m)}>
          {m === 'fixed' ? 'Fixed' : 'Tactical'}
        </button>
      ))}
    </div>
  );
}

/** Pick two cards from a pool: the deck as a list of cards, the chosen two lit; Draw secondary picks one at random. */
function PickTwo({ pool, value, onChange, cards, readOnly }: { pool: string[]; value: string[]; onChange: (v: string[]) => void; cards: Map<string, CardInfo>; readOnly?: boolean }) {
  const full = value.length >= 2;
  const left = pool.filter((s) => !value.includes(s));
  return (
    <div className="mission-pick-list">
      {!readOnly && (
        <p className="small muted" style={{ margin: '0 0 4px' }}>
          Tap a name to read the card, the emblem to choose it or take it back.
        </p>
      )}
      {pool.map((s) => {
        const on = value.includes(s);
        return (
          <MissionRow
            key={s}
            name={s}
            cards={cards}
            selected={on}
            tag={on ? 'Chosen' : undefined}
            selectLabel={on ? `Take back ${s}` : `Choose ${s}`}
            onSelect={readOnly ? undefined : () => (on ? onChange(value.filter((x) => x !== s)) : full ? showToast('Two chosen already: take one back first') : onChange([...value, s]))}
          />
        );
      })}
      {!readOnly && (
        <div className="mission-draw-bar">
          <span className="mission-count">
            <strong className="num">{value.length}/2</strong> chosen
          </span>
          <button
            className="btn btn-primary"
            disabled={full || !left.length}
            onClick={() => {
              const pick = shuffled(left)[0]!;
              onChange([...value, pick]);
              showToast(`Drew ${pick}`);
            }}
          >
            <Icon name="dice" size={18} />
            Draw secondary
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Setup step: Fixed or Tactical, the two Fixed cards, and the rules for each
 * way. `sec`/`onSec` are this side's missions (in a live game, the team's —
 * your teammate sees the same choices). The opponent part is for local games.
 */
export function SecondarySetup({
  sec,
  onSec,
  role,
  game,
  setGame,
  title = 'My secondaries',
}: {
  sec: SecondaryState;
  onSec: (op: SecOp) => void;
  role?: SavedGame['role'];
  /** Local game: also note the opponent's choice (a change made to the latest saved copy). */
  game?: SavedGame;
  setGame?: (p: (g: SavedGame) => Partial<SavedGame>) => void;
  title?: string;
}) {
  const cards = useMissionCards();
  const tags = cardTags(cards);
  const fixedPool = fixedSecondaries(tags.size ? tags : undefined);
  const mode = game?.secondaryMode ?? {};
  const theirs = list(game?.secondaries?.them);
  return (
    <>
      <div className="section-label">{title}</div>
      <ModeSwitch value={sec.mode} onChange={(m) => onSec(m === 'tactical' ? tacticalOp(role, cards) : { op: 'mode', mode: 'fixed' })} />
      {sec.mode && <ModeRules mode={sec.mode} />}
      {sec.mode === 'fixed' && <PickTwo pool={fixedPool} value={sec.fixed} cards={cards} onChange={(v) => onSec({ op: 'fixed', cards: v })} />}
      {sec.mode === 'tactical' && (
        <p className="small muted">
          Your deck of {sec.tactical?.deck.length ?? MISSION_DECK.secondaries.length} cards is shuffled. Draw your first cards in your first Command phase: battle screen → <strong>Missions</strong> → <strong>Draw secondaries</strong>.
        </p>
      )}
      {game && setGame && (
        <>
          <div className="section-label">{game.opponentName || 'Opponent'}'s secondaries</div>
          <ModeSwitch value={mode.them} onChange={(m) => setGame((g) => ({ secondaryMode: { ...g.secondaryMode, them: m }, secondaries: { me: g.secondaries?.me ?? '', them: m === 'fixed' ? (g.secondaries?.them ?? '') : '' } }))} />
          {mode.them === 'fixed' && <PickTwo pool={fixedPool} value={theirs} cards={cards} onChange={(v) => setGame((g) => ({ secondaries: { me: g.secondaries?.me ?? '', them: v.join(', ') } }))} />}
          {mode.them === 'tactical' && <p className="small muted">They draw from their own deck; score their VP in the Score tab.</p>}
        </>
      )}
    </>
  );
}

/** The battle round the Missions tab shows: the current one, until another is picked (only on this screen). */
export function useViewRound(round: number): [number, (r: number) => void] {
  const [picked, setPicked] = useState({ round, at: round });
  // When the game moves to another round, show that one again.
  const view = picked.at === round ? Math.min(picked.round, round) : round;
  return [view, (r: number) => setPicked({ round: r, at: round })];
}

/** Pick a battle round to look at its missions and scores (up to the current one). */
export function MissionRoundPicker({ round, value, onChange }: { round: number; value: number; onChange: (r: number) => void }) {
  if (round <= 1) return null;
  return (
    <div className="mission-round-pick">
      <span className="small muted">Show round</span>
      <div className="seg" role="radiogroup" aria-label="Show the missions of a battle round">
        {Array.from({ length: round }, (_, i) => i + 1).map((r) => (
          <button key={r} role="radio" aria-checked={value === r} className={value === r ? 'on' : undefined} onClick={() => onChange(r)}>
            R{r}
            {r === round ? ' · now' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Battle: the primary and the secondaries of one battle round (`viewRound`,
 * the current `round` unless an earlier one is picked). Every scored part of a
 * card — primary or secondary — is saved with its ticks, so it stays shown as
 * scored and can be undone, in that round or later. The Tactical hand is
 * managed in the Secondaries sheet (draw one at a time, tap to put back).
 * With `readOnly` it shows someone else's missions (an opponent in a live game).
 */
export function MissionsPanel({
  sec,
  onSec,
  round,
  viewRound = round,
  turnKey,
  myCommandPhase,
  onVp,
  primary,
  twist,
  role,
  readOnly,
  who,
}: {
  sec: SecondaryState;
  onSec?: (op: SecOp, text?: string) => void;
  round: number;
  /** The round shown (the current one unless an earlier one is picked). */
  viewRound?: number;
  /** Round and turn now ("2-me"), so parts scored at the end of either player's turn are kept apart. */
  turnKey: string;
  myCommandPhase: boolean;
  /** Add (or with a negative `vp`, take off) VP in a battle round. */
  onVp?: (kind: 'primary' | 'secondary', vp: number, why: string, round: number) => void;
  primary?: string;
  twist?: string;
  role?: SavedGame['role'];
  readOnly?: boolean;
  /** Whose missions these are, for read-only views ("Bob's"). */
  who?: string;
}) {
  const cards = useMissionCards();
  const mode = sec.mode;
  const t = sec.tactical;
  const act = (op: SecOp, text?: string) => onSec?.(op, text);
  const now = viewRound === round;
  const viewKey = now ? turnKey : turnKey.replace(/^\d+/, String(viewRound));
  // Older saves locked the whole card for the round after one Add.
  const primaryDone = (sec.primaryDone ?? []).includes(viewRound);
  const [showAll, setShowAll] = useState(false);
  // A secondary card scores as you tick it: each part kept with its ticks, its VP added (or taken off) straight away.
  const partsOf = (n: string) => ({
    scored: (sec.secParts ?? []).filter((p) => p.name === n),
    turnKey: viewKey,
    onSet: readOnly
      ? undefined
      : (part: string, vp: number, counts: Record<number, number[]>, label: string, prev: number) => {
          if (vp !== prev) onVp?.('secondary', vp - prev, `${n} (${label})`, viewRound);
          act({ op: 'secSet', name: n, round: viewRound, part, vp, counts, prev }, vp === prev ? undefined : `${n}: ${prev} → ${vp} VP (round ${viewRound})`);
        },
  });
  // Tactical: the hand (in the current round) and the cards scored in the round shown.
  const scoredHere = t?.scored.filter((x) => x.round === viewRound).map((x) => x.name) ?? [];
  const shown = [...new Set([...(now ? (t?.active ?? []) : []), ...scoredHere])];
  // Scored before scores were kept part by part: no ticks to show, only that it was scored.
  const legacy = (n: string) => scoredHere.includes(n) && !(sec.secParts ?? []).some((p) => p.name === n && p.round === viewRound);
  const sheetLabel = mode === 'tactical' && t ? `${t.active.length} in hand · ${t.deck.length} in deck` : mode === 'fixed' ? `${sec.fixed.length}/2 chosen` : '';
  const drawNow = !readOnly && now && mode === 'tactical' && myCommandPhase;
  return (
    <div>
      <div className="section-label">
        {who ? `${who} primary` : 'Primary'} · round {viewRound}
      </div>
      {primary ? (
        <ScoreCard
          key={`p-${viewRound}`}
          kind="Primary"
          name={primary}
          cards={cards}
          round={viewRound}
          parts={{
            scored: sec.primaryParts ?? [],
            turnKey: viewKey,
            onAdd: readOnly ? undefined : (part, vp, counts, label) => (onVp?.('primary', vp, `${primary} (${label})`, viewRound), act({ op: 'primaryDone', round: viewRound, done: true, part, vp, counts })),
            onUndo: readOnly ? undefined : (p, label) => (onVp?.('primary', -p.vp, `Undid ${primary} (${label})`, p.round), act({ op: 'primaryDone', round: p.round, done: false, part: p.part })),
          }}
          addLabel={`Add to round ${viewRound} primary:`}
          done={primaryDone ? `Primary scored for round ${viewRound}` : undefined}
          onEnable={readOnly ? undefined : () => act({ op: 'primaryDone', round: viewRound, done: false })}
          readOnly={readOnly}
        />
      ) : (
        <p className="muted small">No primary mission set.</p>
      )}
      {twist && !readOnly && (
        <>
          <div className="section-label">Twist</div>
          <ScoreCard kind="Twist" name={twist} cards={cards} round={viewRound} />
        </>
      )}
      <div className="section-label">
        {who ? `${who} secondaries` : 'Secondaries'}
        {mode ? ` · ${mode === 'fixed' ? 'Fixed' : 'Tactical'}` : ''}
      </div>
      {!mode &&
        (readOnly ? (
          <p className="muted small">Not chosen yet.</p>
        ) : (
          <p className="muted small">
            Not set. Choose Fixed or Tactical:
            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => act({ op: 'mode', mode: 'fixed' })}>
              Fixed
            </button>
            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => act(tacticalOp(role, cards))}>
              Tactical
            </button>
          </p>
        ))}
      {mode && (
        <button className={`btn btn-block all-sec-btn ${drawNow ? 'btn-primary' : ''}`} onClick={() => setShowAll(true)}>
          <Icon name={readOnly ? 'swords' : 'dice'} size={18} />
          <span>{readOnly ? 'Secondaries' : mode === 'tactical' ? (drawNow ? 'Draw secondaries' : 'Secondaries · draw or change') : 'Secondaries · choose'}</span>
          {sheetLabel ? <span className="all-sec-count">{sheetLabel}</span> : null}
        </button>
      )}
      <SecondariesSheet open={showAll} onClose={() => setShowAll(false)} sec={sec} cards={cards} readOnly={readOnly} who={who} act={act} />
      {mode === 'fixed' &&
        (sec.fixed.length ? (
          sec.fixed.map((n) => <ScoreCard key={`${n}-${viewRound}`} kind="Secondary" mode="fixed" name={n} cards={cards} round={viewRound} parts={partsOf(n)} readOnly={readOnly} />)
        ) : (
          <p className="muted small">{readOnly ? 'No Fixed cards chosen yet.' : 'No Fixed cards chosen yet: open Secondaries to choose two.'}</p>
        ))}
      {mode === 'tactical' && t && (
        <>
          {shown.length === 0 && <p className="muted small">{now ? `No cards in hand.${readOnly ? '' : ' Draw them at the start of your Command phase.'}` : `No secondaries scored in round ${viewRound}.`}</p>}
          {shown.map((n) => {
            const inHand = now && t.active.includes(n);
            const old = legacy(n);
            return (
              <ScoreCard
                key={`${n}-${viewRound}`}
                kind={inHand ? 'In hand' : 'Scored'}
                mode="tactical"
                name={n}
                cards={cards}
                round={viewRound}
                readOnly={readOnly}
                parts={old ? undefined : partsOf(n)}
                done={old ? `Scored in round ${viewRound}` : undefined}
                onEnable={readOnly || !old ? undefined : () => (act({ op: 'restore', name: n }), showToast(`${n} back in your hand — take its VP off in Score if needed`))}
                footer={
                  readOnly || !inHand ? undefined : (
                    <div className="btn-row" style={{ marginTop: 8 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => (act({ op: 'discard', name: n }, `Discarded ${n}`), showToast(`${n} discarded — take it back in Secondaries`))}>
                        Discard
                      </button>
                    </div>
                  )
                }
              />
            );
          })}
        </>
      )}
      {!readOnly && <ModeRules mode={mode ?? 'tactical'} />}
    </div>
  );
}

/**
 * Every secondary you can use, with yours highlighted. Tactical: the cards in
 * your hand are lit; Draw secondary (at the bottom) draws one at random, tap
 * it again for another; tap a lit card to put it back in the deck, a discarded
 * one to take it back. Scored cards keep their check. Fixed: choose your two.
 */
function SecondariesSheet({
  open,
  onClose,
  sec,
  cards,
  readOnly,
  who,
  act,
}: {
  open: boolean;
  onClose: () => void;
  sec: SecondaryState;
  cards: Map<string, CardInfo>;
  readOnly?: boolean;
  who?: string;
  act: (op: SecOp, text?: string) => void;
}) {
  const tags = cardTags(cards);
  const t = sec.tactical;
  const title = who ? `${who} secondaries` : 'Secondaries';
  if (sec.mode === 'fixed') {
    return (
      <Sheet open={open} onClose={onClose} title={title}>
        <PickTwo pool={fixedSecondaries(tags.size ? tags : undefined)} value={sec.fixed} cards={cards} readOnly={readOnly} onChange={(v) => act({ op: 'fixed', cards: v }, `Fixed secondaries: ${v.join(', ') || 'none'}`)} />
      </Sheet>
    );
  }
  // The cards this side plays with (its deck was made for its role), in the deck's printed order.
  const mine = t ? new Set([...t.deck, ...t.active, ...t.discarded, ...t.scored.map((x) => x.name)]) : undefined;
  const pool = MISSION_DECK.secondaries.filter((n) => !mine || mine.has(n));
  const canDraw = Boolean(t && (t.deck.length || t.discarded.length));
  const draw = () => {
    if (!t) return;
    const drawn = applySecOp(sec, { op: 'drawFree' }).tactical?.active.find((x) => !t.active.includes(x));
    act({ op: 'drawFree' }, drawn ? `Drew ${drawn}` : undefined);
    showToast(drawn ? `Drew ${drawn}` : 'The deck is empty');
  };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="small muted" style={{ marginTop: 0 }}>
        {readOnly ? 'Lit: in the hand. Tap a name to read the card.' : 'Lit: in your hand. Tap a name to read the card; tap the emblem to put a drawn card back, or take a card into your hand.'}
      </p>
      <div className="mission-pick-list">
        {pool.map((n) => {
          const inHand = Boolean(t?.active.includes(n));
          const sc = t?.scored.filter((x) => x.name === n).at(-1);
          const tag = inHand ? 'In hand' : sc ? `Scored R${sc.round}` : t?.discarded.includes(n) ? 'Discarded' : undefined;
          const onSelect =
            readOnly || !t
              ? undefined
              : () => {
                  if (inHand) {
                    // Back into the deck anywhere but the top, so the next draw isn't the same card.
                    const at = 1 + Math.floor(Math.random() * Math.max(1, t.deck.length));
                    act({ op: 'putBack', name: n, at }, `Put ${n} back in the deck`);
                    showToast(`${n} put back in the deck`);
                  } else if (sc) showToast(`${n} is scored — undo its score on the card to take it back`);
                  else {
                    act({ op: 'take', name: n }, `Took ${n} into the hand`);
                    showToast(`${n} is in your hand`);
                  }
                };
          return <MissionRow key={n} name={n} cards={cards} selected={inHand} done={Boolean(sc) && !inHand} tag={tag} onSelect={onSelect} selectLabel={inHand ? `Put ${n} back` : `Take ${n} into the hand`} />;
        })}
      </div>
      {!readOnly && t && (
        <div className="mission-draw-bar sheet-foot">
          <span className="mission-count">
            <strong className="num">{t.active.length}</strong> in hand · {t.deck.length} in deck
          </span>
          <button className="btn btn-primary" disabled={!canDraw} onClick={draw}>
            <Icon name="dice" size={18} />
            Draw secondary
          </button>
        </div>
      )}
    </Sheet>
  );
}
