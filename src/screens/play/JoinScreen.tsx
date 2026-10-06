import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
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
    <Screen title="Join a live game" back>
      <label className="field">
        <span>Room code</span>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="ABC123" autoCapitalize="characters" style={{ letterSpacing: '0.2em', fontSize: 22 }} />
      </label>
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
      {rosters?.length === 0 && <p className="muted">Make a list first, then join.</p>}
      <div className="btn-row">
        <button className="btn btn-primary btn-block" disabled={!ok} onClick={join}>
          Join
        </button>
      </div>
      <p className="small muted">Phones connect directly to each other. Everyone needs to be online, with the host's game open.</p>
    </Screen>
  );
}
