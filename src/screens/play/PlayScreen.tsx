import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '@/data/db';
import { totalScore } from '@/engine/game';
import { Screen } from '@/ui/Screen';

/** War Journal: games in progress and finished games. */
export function PlayScreen() {
  const games = useLiveQuery(() => db.games.orderBy('startedAt').reverse().toArray(), []);
  const live = games?.filter((g) => g.stage !== 'done') ?? [];
  const done = games?.filter((g) => g.stage === 'done') ?? [];
  const record = done.reduce((r, g) => ({ ...r, [g.result ?? 'draw']: (r[g.result ?? 'draw'] ?? 0) + 1 }), {} as Record<string, number>);
  return (
    <Screen title="War Journal">
      <Link className="btn btn-primary btn-block" to="/play/new">
        New game
      </Link>
      {live.length > 0 && (
        <>
          <div className="section-label">In progress</div>
          <div className="card">
            {live.map((g) => (
              <Link key={g.id} className="unit-row" to={`/play/${g.id}`}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {g.rosterName} vs {g.opponentName || 'opponent'}
                  </div>
                  <div className="muted small">{g.stage === 'setup' ? `Setting up · step ${g.setupStep}` : `Round ${g.round} · ${totalScore(g.vp.me)}–${totalScore(g.vp.them)}`}</div>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
      {done.length > 0 && (
        <>
          <div className="section-label">
            Finished · {record.win ?? 0}W {record.loss ?? 0}L {record.draw ?? 0}D
          </div>
          <div className="card">
            {done.map((g) => (
              <Link key={g.id} className="unit-row" to={`/play/${g.id}`}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {g.rosterName} vs {g.opponentName || 'opponent'}
                  </div>
                  <div className="muted small">
                    {new Date(g.startedAt).toLocaleDateString()} · {totalScore(g.vp.me)}–{totalScore(g.vp.them)} · {g.mission || 'no mission set'}
                  </div>
                </span>
                <span className={g.result === 'win' ? 'tag' : 'muted small'}>{(g.result ?? 'draw').toUpperCase()}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {games && games.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No games yet. Start one from here or from a list's menu.</p>}
    </Screen>
  );
}
