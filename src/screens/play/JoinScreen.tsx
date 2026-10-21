import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { movableGames, moveToRoom } from '@/sync/room';
import { Screen } from '@/ui/Screen';
import { saveGame } from './games';
import { newJoinedGame, rememberName, savedName } from './liveSetup';

/** Join someone's live game: room code (from the QR link or typed), your name and your army. */
export function JoinScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const rosters = useLiveQuery(() => db.rosters.orderBy('updatedAt').reverse().toArray(), []);
  const [code, setCode] = useState('');
  const [name, setName] = useState(savedName());
  const [rosterId, setRosterId] = useState('');
  const games = useLiveQuery(() => db.games.filter((g) => Boolean(g.live)).toArray(), []);
  const movable = /^[A-Z0-9]{6}$/.test(code) ? movableGames(games ?? [], code) : [];
  // Another player carried on as host: bring a game already on this phone into their room.
  const follow = async (gameId: string) => {
    if (await moveToRoom(gameId, code)) navigate(`/play/${gameId}`, { replace: true });
  };
  useEffect(() => {
    const c = location.hash.replace('#', '').trim();
    if (c) setCode(c.toUpperCase());
  }, [location.hash]);
  useEffect(() => {
    if (!rosterId && rosters?.[0]) setRosterId(rosters[0].id);
  }, [rosters, rosterId]);
  const ok = /^[A-Z0-9]{6}$/.test(code) && name.trim() && rosterId;
  const join = async () => {
    const r = rosters?.find((x) => x.id === rosterId);
    if (!r) return;
    rememberName(name.trim());
    const g = newJoinedGame(r, name.trim(), code);
    await saveGame(g);
    navigate(`/play/${g.id}`, { replace: true });
  };
  return (
    <Screen title="Join a live game" back="/play">
      <label className="field">
        <span>Room code</span>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="ABC123" autoCapitalize="characters" style={{ letterSpacing: '0.2em', fontSize: 22 }} />
      </label>
      {movable.length > 0 && (
        <>
          <div className="section-label">Already playing? Follow your game here</div>
          <p className="small muted" style={{ marginTop: 0 }}>
            If another player carried on as host, bring your game into their room instead of joining as someone new. What you did meanwhile is sent there.
          </p>
          <div className="card">
            {movable.map((g) => (
              <button key={g.id} className="choice" onClick={() => void follow(g.id)}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{g.rosterName}</div>
                  <div className="muted small">
                    Room {g.live!.room} · round {g.live!.state?.round ?? g.round}
                  </div>
                </span>
              </button>
            ))}
          </div>
          <div className="section-label">Or join as a new player</div>
        </>
      )}
      <label className="field">
        <span>Your name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="section-label">Your army</div>
      <div className="card">
        {rosters?.map((r) => (
          <button key={r.id} className="choice" role="radio" aria-checked={rosterId === r.id} onClick={() => setRosterId(r.id)}>
            <span className="mark" />
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div className="muted small">{r.factionName}</div>
            </span>
          </button>
        ))}
      </div>
      {rosters?.length === 0 && (
        <p className="muted">
          You need an army to join. <Link to="/new">Make a list</Link> or <Link to="/import">import one</Link>.
        </p>
      )}
      <div className="btn-row">
        <button className="btn btn-primary btn-block" disabled={!ok} onClick={join}>
          Join
        </button>
      </div>
      {!ok && (
        <p className="small muted" role="status">
          To join: {[!/^[A-Z0-9]{6}$/.test(code) && 'the 6-letter room code from the host', !name.trim() && 'your name', !rosterId && 'an army'].filter(Boolean).join(', ')}.
        </p>
      )}
      <p className="small muted">Phones connect directly to each other. Everyone needs to be online, with the host's game open.</p>
    </Screen>
  );
}
