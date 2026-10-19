import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { WizardSteps } from '@/ui/WizardSteps';
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
  const startLive = async (r: Roster) => {
    try {
      setBusy(r.id);
      rememberName(name.trim());
      const g = newHostedGame(r, name.trim());
      await saveGame(g);
      navigate(`/play/${g.id}`, { replace: true });
    } catch (e) {
      setError(`Couldn't start the game: ${storageMessage(e)}`);
    } finally {
      setBusy('');
    }
  };
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
  // Opened from a list ("Start game"): that army is chosen; ask how to play instead of guessing.
  const picked = params.get('roster') ? rosters?.find((x) => x.id === params.get('roster')) : undefined;
  const [hosting, setHosting] = useState(false);
  if (picked && !live) {
    return (
      <Screen title="Start a game" back={`/roster/${picked.id}`}>
        <div className="card row" style={{ marginBottom: 12 }}>
          <span style={{ flex: 1 }}>
            <div className="muted small">Your army</div>
            <div style={{ fontWeight: 600, fontSize: 18 }}>{picked.name}</div>
            <div className="muted small">
              {picked.factionName} · {picked.units.reduce((n, u) => n + u.points, 0)} pts
            </div>
          </span>
        </div>
        {error && <p className="issue-title" role="alert">{error}</p>}
        <div className="mode-choices">
          <button className="mode-choice" onClick={() => void start(picked)} disabled={Boolean(busy)}>
            <strong>On this phone</strong>
            <span className="muted small">Track both sides yourself: turns, CP, score, missions.</span>
          </button>
          <button className="mode-choice" onClick={() => setHosting(true)} aria-expanded={hosting}>
            <strong>Host a live game</strong>
            <span className="muted small">Others join from their phones with a code: 1v1, 2v2, 2v1 or three players.</span>
          </button>
          {hosting && (
            <div className="card" style={{ padding: 12 }}>
              <label className="field" style={{ marginTop: 0 }}>
                <span>Your name (the other players see it)</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <button className="btn btn-primary btn-block" disabled={!name.trim() || Boolean(busy)} onClick={() => void startLive(picked)}>
                Open the room
              </button>
            </div>
          )}
          <Link className="mode-choice" to="/play/join">
            <strong>Join a live game</strong>
            <span className="muted small">Someone else is hosting: type their room code.</span>
          </Link>
        </div>
      </Screen>
    );
  }
  return (
    <Screen title={live ? 'Host a live game' : 'New game'} back="/play">
      {!live && <WizardSteps titles={['Army', 'Opponent', 'Mission', 'Secondaries', 'Pre-battle']} step={0} />}
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
      {rosters?.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">No army yet</div>
          <p className="muted">A game needs one of your lists.</p>
          <div className="btn-row">
            <Link className="btn btn-primary btn-block" to="/new">
              New list
            </Link>
            <Link className="btn btn-block" to="/import">
              Import a list
            </Link>
          </div>
        </div>
      )}
    </Screen>
  );
}
