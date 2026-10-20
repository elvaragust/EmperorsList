import { useState, type ReactNode } from 'react';
import { db, type SavedGame } from '@/data/db';
import { emptyScore, ROUNDS, totalScore, type Score } from '@/engine/game';
import { Collapse } from '@/ui/Collapse';
import { Icon } from '@/ui/Icon';
import { BattleReplay } from './BattleReplay';

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

      <BattleReplay sides={view} health={game.health} rounds={rounds} />

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
