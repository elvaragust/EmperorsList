import type { SavedGame } from '@/data/db';
import { applySecOp, fixedSecondaries, MISSION_DECK, secondariesFor, shuffled, type SecOp, type SecondaryState } from '@/engine/missions';
import { showToast } from '@/ui/Toast';
import { CardText, cardTags, ScoreCard, useMissionCards, type CardInfo } from './missionCards';

type Mode = 'fixed' | 'tactical';
const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** A local game's own missions, kept on the saved game (older fields), as one state. */
export function localSecondaries(g: SavedGame): SecondaryState {
  return { mode: g.secondaryMode?.me, fixed: list(g.secondaries?.me), tactical: g.tactical, primaryDone: g.primaryDone };
}

/** Write a missions state back onto a local game. */
export function localSecondariesPatch(g: SavedGame, s: SecondaryState): Partial<SavedGame> {
  return {
    secondaryMode: { ...g.secondaryMode, me: s.mode },
    secondaries: { me: s.fixed.join(', '), them: g.secondaries?.them ?? '' },
    tactical: s.tactical,
    primaryDone: s.primaryDone,
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
        <strong>Start of your Command phase:</strong> draw 2 cards face up. Cards you haven't scored stay in your hand.
      </li>
      <li>
        <strong>End of your turn:</strong> score any you achieved (then discard them), and you may discard any others.
      </li>
      <li>
        <strong>Redraw:</strong> spend 1CP to discard one card and draw a new one (as often as you like here). A card that says <em>when drawn… draw a new card and shuffle this one back</em> (e.g. in the first battle round): use <strong>Shuffle back &amp; draw</strong>, which is free. <strong>Draw a card</strong> takes one more at any time.
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

/** Pick two cards from a pool. */
function PickTwo({ pool, value, onChange, cards }: { pool: string[]; value: string[]; onChange: (v: string[]) => void; cards: Map<string, CardInfo> }) {
  const full = value.length >= 2;
  return (
    <>
      <div className="small muted">{value.length}/2 chosen{full ? ' — tap one to take it back' : ''}</div>
      <div className="kw-list" style={{ gap: '6px 14px', margin: '6px 0 10px' }}>
        {pool.map((s) => {
          const on = value.includes(s);
          return (
            <button key={s} className={`filter ${on ? 'on' : ''}`} aria-pressed={on} disabled={full && !on} style={full && !on ? { opacity: 0.4 } : undefined} onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}>
              {s}
            </button>
          );
        })}
      </div>
      {value.map((n) => (
        <CardText key={n} name={n} cards={cards} compact />
      ))}
    </>
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
  /** Local game: also note the opponent's choice. */
  game?: SavedGame;
  setGame?: (p: Partial<SavedGame>) => void;
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
          Your deck of {sec.tactical?.deck.length ?? MISSION_DECK.secondaries.length} cards is shuffled. Draw your first two in your first Command phase — the battle screen's <strong>Missions</strong> tab does it for you.
        </p>
      )}
      {game && setGame && (
        <>
          <div className="section-label">{game.opponentName || 'Opponent'}'s secondaries</div>
          <ModeSwitch value={mode.them} onChange={(m) => setGame({ secondaryMode: { ...mode, them: m }, secondaries: { me: game.secondaries?.me ?? '', them: m === 'fixed' ? theirs.join(', ') : '' } })} />
          {mode.them === 'fixed' && <PickTwo pool={fixedPool} value={theirs} cards={cards} onChange={(v) => setGame({ secondaries: { me: game.secondaries?.me ?? '', them: v.join(', ') } })} />}
          {mode.them === 'tactical' && <p className="small muted">They draw from their own deck; score their VP in the Score tab.</p>}
        </>
      )}
    </>
  );
}

/**
 * Battle: the primary (scored line by line for this round, then locked for the
 * round until enabled again), the twist, and the secondaries — the two Fixed
 * cards, or the Tactical hand with draw / add VP / discard / redraw for 1CP.
 * Scored and discarded cards stay listed; tap one to put it back.
 * With `readOnly` it shows someone else's missions (an opponent in a live game).
 */
export function MissionsPanel({
  sec,
  onSec,
  round,
  turnKey,
  myCommandPhase,
  onCp,
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
  /** Changes every turn, so the draw is offered once per Command phase. */
  turnKey: string;
  myCommandPhase: boolean;
  onCp?: (delta: number, why: string) => void;
  onVp?: (kind: 'primary' | 'secondary', vp: number, why: string) => void;
  primary?: string;
  twist?: string;
  role?: SavedGame['role'];
  readOnly?: boolean;
  /** Whose missions these are, for read-only views ("Bob's"). */
  who?: string;
}) {
  const cards = useMissionCards();
  const tags = cardTags(cards);
  const fixedPool = fixedSecondaries(tags.size ? tags : undefined);
  const mode = sec.mode;
  const t = sec.tactical;
  const act = (op: SecOp, text?: string) => onSec?.(op, text);
  const canDraw = !readOnly && mode === 'tactical' && t && t.drawnFor !== turnKey;
  const primaryDone = (sec.primaryDone ?? []).includes(round);
  return (
    <div>
      <div className="section-label">{who ? `${who} primary` : 'Primary'} · round {round}</div>
      {primary ? (
        <ScoreCard
          kind="Primary"
          name={primary}
          cards={cards}
          round={round}
          onAdd={readOnly ? undefined : (vp) => (onVp?.('primary', vp, primary), act({ op: 'primaryDone', round, done: true }))}
          addLabel={`Add to round ${round} primary:`}
          done={primaryDone ? `Primary scored for round ${round}` : undefined}
          onEnable={readOnly ? undefined : () => act({ op: 'primaryDone', round, done: false })}
          readOnly={readOnly}
        />
      ) : (
        <p className="muted small">No primary mission set.</p>
      )}
      {twist && !readOnly && (
        <>
          <div className="section-label">Twist</div>
          <ScoreCard kind="Twist" name={twist} cards={cards} round={round} />
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
      {mode === 'fixed' &&
        (sec.fixed.length ? (
          sec.fixed.map((n) => <ScoreCard key={n} kind="Secondary" mode="fixed" name={n} cards={cards} round={round} onAdd={readOnly ? undefined : (vp) => onVp?.('secondary', vp, n)} addLabel={`Add to round ${round} secondary:`} readOnly={readOnly} />)
        ) : readOnly ? (
          <p className="muted small">No Fixed cards chosen yet.</p>
        ) : (
          <PickTwo pool={fixedPool} value={sec.fixed} cards={cards} onChange={(v) => act({ op: 'fixed', cards: v })} />
        ))}
      {mode === 'tactical' && t && (
        <>
          {canDraw && (
            <button
              className={`btn btn-block ${myCommandPhase ? 'btn-primary' : ''}`}
              onClick={() => {
                const next = applySecOp(sec, { op: 'draw', n: 2, key: turnKey }).tactical;
                const drawn = next?.active.filter((x) => !t.active.includes(x)) ?? [];
                act({ op: 'draw', n: 2, key: turnKey }, drawn.length ? `Drew ${drawn.join(' and ')}` : undefined);
                showToast(`Drew ${drawn.join(' and ') || 'nothing (deck empty)'}`);
              }}
            >
              Draw 2 secondary missions{myCommandPhase ? ' (start of your Command phase)' : ''}
            </button>
          )}
          {t.active.length === 0 && <p className="muted small">No active cards.{canDraw || readOnly ? '' : ' Draw at the start of your next Command phase.'}</p>}
          {!readOnly && !canDraw && (
            <button
              className="btn btn-sm btn-block"
              disabled={!t.deck.length && !t.discarded.length}
              onClick={() => {
                const next = applySecOp(sec, { op: 'drawFree' }).tactical;
                const drawn = next?.active.filter((x) => !t.active.includes(x)) ?? [];
                act({ op: 'drawFree' }, drawn.length ? `Drew ${drawn.join(', ')} (extra card)` : undefined);
                showToast(drawn.length ? `Drew ${drawn.join(', ')}` : 'The deck is empty');
              }}
            >
              Draw a card (free)
            </button>
          )}
          {t.active.map((n) => (
            <ScoreCard
              key={n}
              kind="Secondary"
              mode="tactical"
              name={n}
              cards={cards}
              round={round}
              readOnly={readOnly}
              addLabel="Achieved — add"
              onAdd={
                readOnly
                  ? undefined
                  : (vp) => {
                      onVp?.('secondary', vp, n);
                      act({ op: 'score', name: n, round }, `Scored ${n} (+${vp} VP)`);
                    }
              }
              footer={
                readOnly ? undefined : (
                  <div className="btn-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm" onClick={() => (act({ op: 'discard', name: n }, `Discarded ${n}`), showToast(`${n} discarded`))}>
                      Discard
                    </button>
                    <button
                      className="btn btn-sm"
                      title="Free: put this card back in the deck and draw a new one (for cards that say so when drawn, e.g. in the first battle round)"
                      disabled={!t.deck.length}
                      onClick={() => {
                        const at = 1 + Math.floor(Math.random() * Math.max(1, t.deck.length));
                        const next = applySecOp(sec, { op: 'shuffleBack', name: n, at }).tactical;
                        const drawn = next?.active.find((x) => !t.active.includes(x));
                        act({ op: 'shuffleBack', name: n, at }, `Shuffled ${n} back and drew ${drawn ?? 'nothing'}`);
                        showToast(drawn ? `${n} went back · drew ${drawn}` : `${n} went back into the deck`);
                      }}
                    >
                      Shuffle back &amp; draw (free)
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      title="Spend 1CP: discard this card and draw a new one"
                      disabled={!t.deck.length && !t.discarded.length}
                      onClick={() => {
                        act({ op: 'redraw', name: n }, `Redraw: swapped ${n} (1 CP)`);
                        onCp?.(-1, `Redraw: swapped ${n}`);
                      }}
                    >
                      Redraw (1CP){t.redraws ? ` · used ${t.redraws}×` : ''}
                    </button>
                  </div>
                )
              }
            />
          ))}
          {(t.scored.length > 0 || t.discarded.length > 0) && (
            <>
              <div className="small muted">{readOnly ? 'Scored ✓ and discarded' : 'Scored ✓ and discarded — tap one to put it back in your hand'}</div>
              <div className="done-list">
                {t.scored.map((s, i) => (
                  <button key={`s${i}`} disabled={readOnly} onClick={() => (act({ op: 'restore', name: s.name }), showToast(`${s.name} back in your hand — take its VP off in Score if needed`))}>
                    ✓ {s.name} · R{s.round}
                  </button>
                ))}
                {t.discarded.map((d, i) => (
                  <button
                    key={`d${i}`}
                    className="discarded"
                    disabled={readOnly}
                    onClick={() => {
                      const gaveCp = (t.discardCp ?? []).includes(d);
                      act({ op: 'restore', name: d });
                      if (gaveCp) onCp?.(-1, `Undid discard of ${d}`);
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="small muted">Deck {t.deck.length} cards</p>
        </>
      )}
      {!readOnly && <ModeRules mode={mode ?? 'tactical'} />}
    </div>
  );
}
