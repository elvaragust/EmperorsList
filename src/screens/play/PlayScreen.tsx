import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
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
import { Loading } from '@/ui/Loading';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { Icon } from '@/ui/Icon';
import { showToast } from '@/ui/Toast';

/** War Journal: games in progress and finished games. */
export function PlayScreen() {
  const games = useLiveQuery(() => db.games.orderBy('startedAt').reverse().filter((g) => !g.practice).toArray(), []);
  const live = games?.filter((g) => g.stage !== 'done' || g.idle) ?? [];
  const done = games?.filter((g) => g.stage === 'done' && !g.idle) ?? [];
  const [menu, setMenu] = useState<SavedGame | null>(null);
  const [confirm, setConfirm] = useState(false);
  const title = (g: SavedGame) => (g.live ? liveTitle(g) : `${g.rosterName} vs ${g.opponentName || 'opponent'}`);
  const close = () => (setMenu(null), setConfirm(false));
  const more = (g: SavedGame) => (
    <button
      className="icon-btn"
      aria-label={`More for ${title(g)}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu(g);
      }}
    >
      <Icon name="more" />
    </button>
  );
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
      <p className="small muted" style={{ margin: '0 0 4px' }}>
        <strong>New game</strong> tracks a game on this phone. <strong>Host</strong> / <strong>Join</strong> play live across phones (1v1, 2v2, 2v1 or three players): turn, CP, score and missions stay in step.
      </p>
      <Link className="card choice" to="/play/layouts" style={{ marginTop: 8 }}>
        <Icon name="map" />
        <span style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>Table layouts</div>
          <div className="muted small">Photos of terrain set-ups to pick when you start a game</div>
        </span>
      </Link>
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
                  <div className="muted small">{g.idle ? 'Ended after 2 hours with no changes · tap to resume · ' : ''}{g.live ? `Live · room ${g.live.room} · ` : ''}{(g.idle?.stage ?? g.stage) === 'setup' ? (g.live ? 'Lobby' : `Setting up · step ${g.setupStep}`) : g.live?.state ? `Round ${g.live.state.round} · ${totalScore(g.live.state.vp.A)}–${totalScore(g.live.state.vp.B)}` : `Round ${g.round} · ${totalScore(g.vp.me)}–${totalScore(g.vp.them)}`}</div>
                </span>
                {more(g)}
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
                {more(g)}
              </Link>
            ))}
          </div>
        </>
      )}
      <Sheet open={Boolean(menu) && !confirm} onClose={close} title={menu ? title(menu) : undefined}>
        {menu && (
          <>
            <Link className="menu-item" to={`/play/${menu.id}`} onClick={close}>
              Open
            </Link>
            <button className="menu-item btn-danger" onClick={() => setConfirm(true)}>
              Delete game…
            </button>
          </>
        )}
      </Sheet>
      <ConfirmSheet
        open={confirm && Boolean(menu)}
        onClose={close}
        title="Delete this game?"
        message={menu && menu.stage !== 'done' ? 'It is still in progress. Its score and log are removed from this phone.' : 'Its result and log are removed from this phone.'}
        confirm="Delete game"
        danger
        onConfirm={() => {
          if (menu) void db.games.delete(menu.id).then(() => showToast('Game deleted'));
        }}
      />
      {!games && <Loading what="your games" />}
      {games && games.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No games yet. Start one from here or from a list's menu.</p>}
    </Screen>
  );
}
