import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '@/data/db';
import { totalScore } from '@/engine/game';
import { teamNames } from '@/engine/live';
import type { SavedGame } from '@/data/db';

function liveTitle(g: SavedGame): string {
  const st = g.live?.state;
  if (!st) return `${g.rosterName} · joining room ${g.live?.room}`;
  return `${teamNames(st, 'A')} vs ${teamNames(st, 'B')}`;
}
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
        New game (this phone)
      </Link>
      <div className="btn-row">
        <Link className="btn" style={{ flex: 1 }} to="/play/new?live=1">
          Host live game
        </Link>
        <Link className="btn" style={{ flex: 1 }} to="/play/join">
          Join
        </Link>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Live games sync turn, phase, CP and score between phones — 1v1 or 2v2. <Link to="/play/layouts" className="tag">TABLE LAYOUTS</Link>
      </p>
      {live.length > 0 && (
        <>
          <div className="section-label">In progress</div>
          <div className="card">
            {live.map((g) => (
              <Link key={g.id} className="unit-row" to={`/play/${g.id}`}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {g.live ? liveTitle(g) : `${g.rosterName} vs ${g.opponentName || 'opponent'}`}
                  </div>
                  <div className="muted small">{g.live ? `Live · room ${g.live.room} · ` : ''}{g.stage === 'setup' ? (g.live ? 'Lobby' : `Setting up · step ${g.setupStep}`) : g.live?.state ? `Round ${g.live.state.round} · ${totalScore(g.live.state.vp.A)}–${totalScore(g.live.state.vp.B)}` : `Round ${g.round} · ${totalScore(g.vp.me)}–${totalScore(g.vp.them)}`}</div>
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
                    {g.live ? liveTitle(g) : `${g.rosterName} vs ${g.opponentName || 'opponent'}`}
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
