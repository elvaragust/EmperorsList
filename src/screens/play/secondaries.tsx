import type { SavedGame } from '@/data/db';
import { discardTactical, drawTactical, fixedSecondaries, MISSION_DECK, newTactical, restoreTactical, scoreTactical, secondariesFor, type TacticalState } from '@/engine/missions';
import { showToast } from '@/ui/Toast';
import { CardText, cardTags, ScoreCard, useMissionCards, type CardInfo } from './missionCards';

type Mode = 'fixed' | 'tactical';
const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

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
        <strong>Once per battle:</strong> spend 1CP to discard one card and draw a new one (<em>Redraw</em>).
      </li>
      <li>At most 15VP from secondaries per battle round, 45VP per game.</li>
    </ul>
  );
}

function ModeSwitch({ value, onChange }: { value?: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="seg" role="radiogroup" style={{ margin: '6px 0' }}>
      {(['fixed', 'tactical'] as const).map((m) => (
        <button key={m} role="radio" aria-checked={value === m} className={value === m ? 'on' : undefined} onClick={() => onChange(m)}>
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

/** Setup step: Fixed or Tactical for each player, the two Fixed cards, and the rules for each way. */
export function SecondarySetup({ game, set, opponent = true }: { game: SavedGame; set: (p: Partial<SavedGame>) => void; opponent?: boolean }) {
  const cards = useMissionCards();
  const tags = cardTags(cards);
  const mode = game.secondaryMode ?? {};
  const fixedPool = fixedSecondaries(tags.size ? tags : undefined);
  const mine = list(game.secondaries?.me);
  const theirs = list(game.secondaries?.them);
  const setMine = (m: Mode) =>
    set({
      secondaryMode: { ...mode, me: m },
      secondaries: { me: m === 'fixed' ? mine.filter((x) => fixedPool.includes(x)).join(', ') : '', them: game.secondaries?.them ?? '' },
      tactical: m === 'tactical' ? newTactical(secondariesFor(game.role, tags.size ? tags : undefined)) : undefined,
    });
  return (
    <>
      <div className="section-label">My secondaries</div>
      <ModeSwitch value={mode.me} onChange={setMine} />
      {mode.me && <ModeRules mode={mode.me} />}
      {mode.me === 'fixed' && <PickTwo pool={fixedPool} value={mine} cards={cards} onChange={(v) => set({ secondaries: { me: v.join(', '), them: game.secondaries?.them ?? '' } })} />}
      {mode.me === 'tactical' && (
        <p className="small muted">
          Your deck of {game.tactical?.deck.length ?? MISSION_DECK.secondaries.length} cards is shuffled. Draw your first two in your first Command phase — the battle screen's <strong>Missions</strong> tab does it for you.
        </p>
      )}
      {opponent && (
        <>
          <div className="section-label">{game.opponentName || 'Opponent'}'s secondaries</div>
          <ModeSwitch value={mode.them} onChange={(m) => set({ secondaryMode: { ...mode, them: m }, secondaries: { me: game.secondaries?.me ?? '', them: m === 'fixed' ? theirs.join(', ') : '' } })} />
          {mode.them === 'fixed' && <PickTwo pool={fixedPool} value={theirs} cards={cards} onChange={(v) => set({ secondaries: { me: game.secondaries?.me ?? '', them: v.join(', ') } })} />}
          {mode.them === 'tactical' && <p className="small muted">They draw from their own deck; score their VP in the Score tab.</p>}
        </>
      )}
    </>
  );
}

/**
 * Battle: my primary (scored line by line for this round), the twist, and my
 * secondaries — the two Fixed cards, or the Tactical hand with draw / add VP /
 * discard for 1CP / new card. Scored and discarded cards stay listed; tap one to undo.
 */
export function MissionsPanel({
  game,
  round,
  turnKey,
  myCommandPhase,
  onChange,
  onCp,
  onVp,
  primary,
}: {
  game: SavedGame;
  round: number;
  /** Changes every turn, so the draw is offered once per Command phase. */
  turnKey: string;
  myCommandPhase: boolean;
  onChange: (p: Partial<SavedGame>) => void;
  onCp: (delta: number, why: string) => void;
  onVp: (kind: 'primary' | 'secondary', vp: number, why: string) => void;
  primary?: string;
}) {
  const cards = useMissionCards();
  const tags = cardTags(cards);
  const mode = game.secondaryMode?.me;
  const t: TacticalState | undefined = game.tactical ?? (mode === 'tactical' ? newTactical(secondariesFor(game.role, tags.size ? tags : undefined)) : undefined);
  const put = (next: TacticalState) => onChange({ tactical: next });
  const canDraw = mode === 'tactical' && t && t.drawnFor !== turnKey;
  return (
    <div>
      <div className="section-label">Primary · round {round}</div>
      {primary ? <ScoreCard name={primary} cards={cards} round={round} onAdd={(vp) => onVp('primary', vp, primary)} addLabel={`Add to round ${round} primary:`} /> : <p className="muted small">No primary mission set.</p>}
      {game.twist && (
        <>
          <div className="section-label">Twist</div>
          <ScoreCard name={game.twist} cards={cards} round={round} />
        </>
      )}
      <div className="section-label">Secondaries{mode ? ` · ${mode === 'fixed' ? 'Fixed' : 'Tactical'}` : ''}</div>
      {!mode && (
        <p className="muted small">
          Not set. Choose Fixed or Tactical:
          <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => onChange({ secondaryMode: { ...game.secondaryMode, me: 'fixed' } })}>
            Fixed
          </button>
          <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => onChange({ secondaryMode: { ...game.secondaryMode, me: 'tactical' }, tactical: newTactical(secondariesFor(game.role, tags.size ? tags : undefined)) })}>
            Tactical
          </button>
        </p>
      )}
      {mode === 'fixed' &&
        (list(game.secondaries?.me).length ? (
          list(game.secondaries?.me).map((n) => <ScoreCard key={n} name={n} cards={cards} round={round} onAdd={(vp) => onVp('secondary', vp, n)} addLabel={`Add to round ${round} secondary:`} />)
        ) : (
          <p className="muted small">No Fixed cards chosen.</p>
        ))}
      {mode === 'tactical' && t && (
        <>
          {canDraw && (
            <button
              className={`btn btn-block ${myCommandPhase ? 'btn-primary' : ''}`}
              onClick={() => {
                const next = drawTactical(t, 2);
                put({ ...next, drawnFor: turnKey });
                showToast(`Drew ${next.active.filter((x) => !t.active.includes(x)).join(' and ') || 'nothing (deck empty)'}`);
              }}
            >
              Draw 2 secondary missions{myCommandPhase ? ' (start of your Command phase)' : ''}
            </button>
          )}
          {t.active.length === 0 && <p className="muted small">No active cards.{canDraw ? '' : ' Draw at the start of your next Command phase.'}</p>}
          {t.active.map((n) => (
            <ScoreCard
              key={n}
              name={n}
              cards={cards}
              round={round}
              addLabel="Achieved — add"
              onAdd={(vp) => {
                onVp('secondary', vp, n);
                put(scoreTactical(t, n, round));
              }}
              footer={
                <div className="btn-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      put(scoreTactical(t, n, round));
                      showToast(`${n} marked achieved`);
                    }}
                  >
                    Achieved
                  </button>
                  <button className="btn btn-sm" onClick={() => (put(discardTactical(t, n)), showToast(`${n} discarded`))}>
                    Discard
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={t.newOrdersUsed}
                    title="Once per battle: spend 1CP to discard this card and draw a new one"
                    onClick={() => {
                      const next = drawTactical({ ...discardTactical(t, n), newOrdersUsed: true }, 1);
                      put(next);
                      onCp(-1, `Redraw: swapped ${n}`);
                    }}
                  >
                    {t.newOrdersUsed ? 'Redraw used' : 'Redraw (1CP)'}
                  </button>
                </div>
              }
            />
          ))}
          {(t.scored.length > 0 || t.discarded.length > 0) && (
            <>
              <div className="small muted">Scored ✓ and discarded — tap one to put it back in your hand</div>
              <div className="done-list">
                {t.scored.map((s, i) => (
                  <button key={`s${i}`} onClick={() => (put(restoreTactical(t, s.name)), showToast(`${s.name} back in your hand — take its VP off in Score if needed`))}>
                    ✓ {s.name} · R{s.round}
                  </button>
                ))}
                {t.discarded.map((d, i) => (
                  <button
                    key={`d${i}`}
                    className="discarded"
                    onClick={() => {
                      const gaveCp = (t.discardCp ?? []).includes(d);
                      put(restoreTactical(t, d));
                      if (gaveCp) onCp(-1, `Undid discard of ${d}`);
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
      <ModeRules mode={mode ?? 'tactical'} />
    </div>
  );
}
