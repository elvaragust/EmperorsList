import { useState, type ReactNode } from 'react';
import { db, type SavedGame } from '@/data/db';
import { emptyScore, ROUNDS, totalScore, type Score } from '@/engine/game';
import { Collapse } from '@/ui/Collapse';
import { Icon } from '@/ui/Icon';

export interface ResultSide {
  /** Stable key for local edits: 'me' / 'them' in a local game, the team letter in a live one. */
  key: string;
  name: string;
  /** The score as the game recorded it. */
  score: Score;
  isMe: boolean;
}

export type Outcome = 'win' | 'loss' | 'draw';

/** Scores with this phone's own corrections applied (they never leave the phone). */
export function viewedScores(sides: ResultSide[], edits: SavedGame['scoreEdits']): (ResultSide & { shown: Score; edited: boolean })[] {
  return sides.map((s) => {
    const e = edits?.[s.key];
    return { ...s, shown: e ?? s.score, edited: Boolean(e) };
  });
}

/** Win, loss or draw for me, from the scores as shown. */
export function outcomeOf(sides: { isMe: boolean; shown: Score }[]): Outcome {
  const mine = Math.max(...sides.filter((s) => s.isMe).map((s) => totalScore(s.shown)));
  const best = Math.max(...sides.filter((s) => !s.isMe).map((s) => totalScore(s.shown)));
  return mine > best ? 'win' : mine < best ? 'loss' : 'draw';
}

const OUTCOME_TEXT: Record<Outcome, string> = { win: 'Victory', loss: 'Defeat', draw: 'Draw' };

function duration(game: SavedGame): string | undefined {
  if (!game.finishedAt) return undefined;
  const mins = Math.round((game.finishedAt - game.startedAt) / 60000);
  if (mins < 1) return undefined;
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/**
 * The end of a game: who won, by how much, the score round by round, and the
 * game's details. Scores can be corrected here, but only for this phone: in a
 * live game each player fixes their own view (both sides' numbers), nothing is
 * sent, and "Back to the game's score" undoes it.
 */
export function ResultView({ game, sides, details, actions, roundsPlayed }: { game: SavedGame; sides: ResultSide[]; details: string[]; actions: ReactNode; /** The last battle round played. */ roundsPlayed: number }) {
  const [editing, setEditing] = useState(false);
  const view = viewedScores(sides, game.scoreEdits);
  const outcome = outcomeOf(view);
  const anyEdits = view.some((s) => s.edited);
  const top = Math.max(...view.map((s) => totalScore(s.shown)));
  const winners = view.filter((s) => totalScore(s.shown) === top);
  const totals = view.map((s) => totalScore(s.shown)).sort((a, b) => b - a);
  const margin = (totals[0] ?? 0) - (totals[1] ?? 0);
  const ordered = [...view].sort((a, b) => Number(b.isMe) - Number(a.isMe));
  // Rounds to summarise: as far as the game got, or further if VP were entered for later rounds.
  const lastVp = Math.max(0, ...view.flatMap((s) => [...s.shown.primary, ...s.shown.secondary].map((v, i) => (v ? (i % ROUNDS) + 1 : 0))));
  const rounds = Math.min(ROUNDS, Math.max(roundsPlayed, lastVp, ...Object.values(game.health ?? {}).map((l) => l.length)));

  const setScore = (key: string, kind: keyof Score, round: number, value: number) => {
    const base = view.find((s) => s.key === key)!.shown;
    const next: Score = { ...base, [kind]: base[kind].map((x, i) => (i === round ? Math.max(0, value) : x)) };
    const edits = { ...game.scoreEdits, [key]: next };
    const nextView = viewedScores(sides, edits);
    void db.games.update(game.id, { scoreEdits: edits, result: outcomeOf(nextView) });
  };
  const reset = () => void db.games.update(game.id, { scoreEdits: undefined, result: outcomeOf(viewedScores(sides, undefined)) });

  return (
    <div className="result">
      <div className={`result-hero ${outcome}`}>
        <div className="result-outcome">{OUTCOME_TEXT[outcome]}</div>
        <div className="result-sub">
          {outcome === 'draw' ? 'Level on points' : winners.length === 1 ? `${winners[0]!.name} won by ${margin} VP` : ''}
          {anyEdits ? ' · scores corrected on this phone' : ''}
        </div>
      </div>

      <div className={`result-scores n${ordered.length}`}>
        {ordered.map((s) => {
          const win = outcome !== 'draw' && totalScore(s.shown) === top;
          return (
            <div key={s.key} className={`result-side ${win ? 'winner' : ''}`}>
              {win && (
                <span className="winner-tag">
                  <Icon name="check" size={14} />
                  Winner
                </span>
              )}
              <div className="result-name">{s.name}</div>
              <div className="result-total num">{totalScore(s.shown)}</div>
              <div className="small muted">
                {s.shown.primary.reduce((a, b) => a + b, 0)} primary · {s.shown.secondary.reduce((a, b) => a + b, 0)} secondary
              </div>
              {s.edited && <div className="small edited-tag">edited here</div>}
            </div>
          );
        })}
      </div>

      <p className="small muted result-details">{details.filter(Boolean).join(' · ')}</p>

      <BattleSwing sides={view} health={game.health} rounds={rounds} />

      <div className="section-label">Round by round</div>
      <div className="card result-table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              <th />
              {Array.from({ length: ROUNDS }, (_, i) => (
                <th key={i}>R{i + 1}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((s) =>
              (['primary', 'secondary'] as const).map((kind) => (
                <tr key={`${s.key}-${kind}`} className={kind === 'primary' ? 'first' : undefined}>
                  <th scope="row">
                    {kind === 'primary' ? <div className="result-row-name">{s.name}</div> : null}
                    <span className="muted small">{kind === 'primary' ? 'Primary' : 'Secondary'}</span>
                  </th>
                  {(s.shown[kind].length ? s.shown[kind] : emptyScore()[kind]).map((v, i) => (
                    <td key={i}>
                      {editing ? (
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={v || ''}
                          placeholder="0"
                          aria-label={`${s.name} ${kind} round ${i + 1}`}
                          onChange={(e) => setScore(s.key, kind, i, Number(e.target.value) || 0)}
                        />
                      ) : (
                        v || '–'
                      )}
                    </td>
                  ))}
                  <td className="num">{s.shown[kind].reduce((a, b) => a + b, 0)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <div className="btn-row">
        <button className={`btn btn-sm ${editing ? 'btn-primary' : ''}`} onClick={() => setEditing(!editing)}>
          <Icon name={editing ? 'check' : 'pencil'} size={16} />
          {editing ? 'Done' : 'Correct the score'}
        </button>
        {anyEdits && (
          <button className="btn btn-sm btn-ghost" onClick={reset}>
            Back to the game's score
          </button>
        )}
      </div>
      {editing && <p className="small muted" style={{ marginTop: 0 }}>Changes stay on this phone: they change how you see the result, not anyone else's.</p>}

      <label className="field">
        <span>Your notes</span>
        <textarea className="input" defaultValue={game.notes ?? ''} placeholder="What worked, what to change next time…" onBlur={(e) => db.games.update(game.id, { notes: e.target.value })} />
      </label>
      <div className="btn-row">{actions}</div>
    </div>
  );
}

/** Share of starting wounds left at the end of round r (1 = untouched), carried forward through rounds with no losses. */
function healthAt(list: (number | null)[] | undefined, r: number): number | undefined {
  if (!list) return undefined;
  for (let i = r - 1; i >= 0; i--) if (list[i] != null) return list[i]!;
  return 1;
}

/**
 * How the battle swung, round by round: VP won that round, and how much of
 * each army fell that round as a share of its own starting wounds (so a horde
 * and an elite army compare fairly). Each bar leans toward the side that came
 * out ahead; the numbers are written next to it.
 */
export function BattleSwing({ sides, health, rounds }: { sides: (ResultSide & { shown: Score })[]; health?: SavedGame['health']; rounds: number }) {
  const me = sides.find((s) => s.isMe);
  const others = sides.filter((s) => !s.isMe);
  if (!me || !others.length || rounds < 1) return null;
  const vpIn = (s: { shown: Score }, r: number) => (s.shown.primary[r - 1] ?? 0) + (s.shown.secondary[r - 1] ?? 0);
  const lossIn = (key: string, r: number) => {
    const list = health?.[key];
    if (!list || list.every((x) => x == null)) return undefined;
    return Math.max(0, (healthAt(list, r - 1) ?? 1) - (healthAt(list, r) ?? 1)) * 100;
  };
  const rows = Array.from({ length: rounds }, (_, i) => {
    const r = i + 1;
    // In a free-for-all, each round compares you with whoever did best against you.
    const rival = [...others].sort((a, b) => vpIn(b, r) - vpIn(a, r))[0]!;
    const myVp = vpIn(me, r);
    const theirVp = vpIn(rival, r);
    const myLoss = lossIn(me.key, r);
    const theirLosses = others.map((o) => lossIn(o.key, r)).filter((x): x is number => x !== undefined);
    const theirLoss = theirLosses.length ? Math.max(...theirLosses) : undefined;
    return { r, rival, myVp, theirVp, myLoss, theirLoss };
  });
  const vpMax = Math.max(5, ...rows.map((x) => Math.abs(x.myVp - x.theirVp)));
  const lossMax = Math.max(10, ...rows.map((x) => Math.abs((x.theirLoss ?? 0) - (x.myLoss ?? 0))));
  const tracked = rows.some((x) => x.theirLoss !== undefined);
  const pct = (v?: number) => (v === undefined ? '–' : `${Math.round(v)}%`);
  const opp = others.length === 1 ? others[0]!.name : 'Opponents';
  const bar = (diff: number, max: number, label: string) => {
    const w = Math.min(50, (Math.abs(diff) / max) * 50);
    const side = diff > 0 ? 'me' : diff < 0 ? 'them' : 'even';
    return (
      <div className="swing-track" role="img" aria-label={label} title={label}>
        <span className="swing-axis" aria-hidden="true" />
        {side !== 'even' && <span className={`swing-bar ${side}`} style={{ width: `${Math.max(w, 1.5)}%` }} aria-hidden="true" />}
      </div>
    );
  };
  return (
    <>
      <div className="section-label">How the battle swung</div>
      <div className="card swing">
        <div className="swing-legend small">
          <span>
            <span className="swing-key me" aria-hidden="true" />
            {me.name}
          </span>
          <span className="muted">← ahead · ahead →</span>
          <span>
            {opp}
            <span className="swing-key them" aria-hidden="true" />
          </span>
        </div>
        {rows.map((x) => {
          const vpDiff = x.myVp - x.theirVp;
          const lossDiff = x.theirLoss !== undefined && x.myLoss !== undefined ? x.theirLoss - x.myLoss : x.myLoss !== undefined ? -x.myLoss : 0;
          return (
            <div key={x.r} className="swing-round">
              <div className="swing-r num">R{x.r}</div>
              <div className="swing-rows">
                <div className="swing-line">
                  <span className="swing-what small muted">VP</span>
                  {bar(vpDiff, vpMax, `Round ${x.r} VP: ${me.name} ${x.myVp}, ${x.rival.name} ${x.theirVp}`)}
                  <span className="swing-vals small num">
                    {x.myVp} – {x.theirVp}
                  </span>
                </div>
                <div className="swing-line">
                  <span className="swing-what small muted">Losses</span>
                  {bar(lossDiff, lossMax, `Round ${x.r} army lost: ${me.name} ${pct(x.myLoss)}, ${opp} ${pct(x.theirLoss)}`)}
                  <span className="swing-vals small num">
                    {pct(x.myLoss)} – {pct(x.theirLoss)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <p className="small muted swing-note">
          VP: points scored that round. Losses: how much of each army was removed that round, as a share of its own starting wounds{tracked ? '' : ` — ${opp}'s losses aren't tracked in a game on one phone, so the bar shows yours`}.
        </p>
      </div>
    </>
  );
}

/** The game's log, folded away under the result. */
export function ResultLog({ entries }: { entries: { round: number; text: string }[] }) {
  if (!entries.length) return null;
  return (
    <Collapse title="Game log" right={<span className="muted small num">{entries.length}</span>}>
      <div className="card">
        {entries.map((l, i) => (
          <div key={i} className="row small">
            <span className="muted" style={{ width: 30 }}>
              R{l.round}
            </span>
            <span style={{ flex: 1 }}>{l.text}</span>
          </div>
        ))}
      </div>
    </Collapse>
  );
}

export { duration as gameDuration };
