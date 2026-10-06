import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '@/data/db';
import type { Roster } from '@/engine/types';
import { Screen } from '@/ui/Screen';
import { Loading } from '@/ui/Loading';
import { showToast } from '@/ui/Toast';
import { storageMessage } from '@/data/storage';
import { newGame, saveGame } from './games';
import { newHostedGame, rememberName, savedName } from './liveSetup';

/** Step 1 of game setup: choose your army. */
export function NewGameScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rosters = useLiveQuery(() => db.rosters.orderBy('updatedAt').reverse().toArray(), []);
  const live = params.get('live') === '1';
  const [name, setName] = useState(savedName());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const start = async (r: Roster) => {
    if (busy) return;
    setError('');
    if (live && !name.trim()) {
      setError('Type your name first — the other players see it.');
      showToast('Type your name first');
      return;
    }
    try {
      setBusy(r.id);
      if (live) rememberName(name.trim());
      const g = live ? newHostedGame(r, name.trim()) : newGame(r);
      await saveGame(g);
      navigate(`/play/${g.id}`, { replace: true });
    } catch (e) {
      setError(`Couldn't start the game: ${storageMessage(e)}`);
    } finally {
      setBusy('');
    }
  };
  useEffect(() => {
    const id = params.get('roster');
    const r = id && rosters?.find((x) => x.id === id);
    if (r && !live) void start(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, rosters]);
  return (
    <Screen title={live ? 'Host a live game' : 'New game · Army'} back>
      <div className="wizard-steps" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i === 0 ? 'done' : undefined} />
        ))}
      </div>
      {live && (
        <label className="field">
          <span>Your name (shown to the other players)</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      {error && <p className="issue-title" role="alert">{error}</p>}
      <p className="muted small">Which army are you playing?</p>
      {!rosters && <Loading what="your lists" />}
      <div className="card">
        {rosters?.map((r) => (
          <button key={r.id} className="choice" onClick={() => start(r)} disabled={Boolean(busy)} aria-busy={busy === r.id}>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div className="muted small">
                {busy === r.id ? 'Starting…' : `${r.factionName} · ${r.units.reduce((s, u) => s + u.points, 0)} pts`}
              </div>
            </span>
          </button>
        ))}
      </div>
      {rosters?.length === 0 && <p className="muted">Make a list first.</p>}
    </Screen>
  );
}
