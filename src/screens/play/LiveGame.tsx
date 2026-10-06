import { useLiveQuery } from 'dexie-react-hooks';
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type SavedGame } from '@/data/db';
import { nextPhase, PHASE_NAMES, PHASES, ROUNDS, totalScore } from '@/engine/game';
import { otherTeam, teamNames, type LiveAction, type LiveState, type Team } from '@/engine/live';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import { closeRoom, joinUrl, type Room } from '@/sync/room';
import { useRoom } from '@/sync/useRoom';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';
import { ScoreRow } from './GameScreen';
import { PhasePanel, SummaryList, toSummaries, unitsLeft, UnitsPanel } from './panels';
import { LayoutPicker } from './layouts';

/** A game played live across phones (1v1 or 2v2). The host's phone is the referee. */
export function LiveGame({ game, engine }: { game: SavedGame; engine?: RosterEngine }) {
  const room = useRoom(game);
  const state = game.live?.state;
  const myId = game.live!.myId;
  const dispatch = (a: LiveAction) => room?.dispatch(a);

  // Share how many models each of my units has left, so the other players can see it.
  const mine = useMemo(() => (engine ? toSummaries(unitsLeft(engine, game.casualties)) : undefined), [engine, game.casualties]);
  const sent = JSON.stringify(state?.units[myId] ?? null);
  useEffect(() => {
    if (!mine || !state || state.stage === 'lobby' || room?.status !== 'online') return;
    if (JSON.stringify(mine) !== sent) dispatch({ t: 'units', units: mine });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, sent, state?.stage, room?.status]);

  if (!state) {
    return (
      <Screen title="Joining…" back>
        <Status room={room} />
        <p className="muted">Waiting for the host's game. Keep this screen open.</p>
      </Screen>
    );
  }
  const me = state.players.find((p) => p.id === myId);
  if (!me && state.stage !== 'lobby') {
    return (
      <Screen title="Live game" back>
        <p className="issue-title">This game started without you.</p>
      </Screen>
    );
  }
  if (state.stage === 'lobby') return <Lobby game={game} state={state} room={room} dispatch={dispatch} />;
  if (state.stage === 'battle') return <LiveBattle game={game} state={state} room={room} engine={engine} dispatch={dispatch} />;
  return <LiveResult game={game} state={state} room={room} dispatch={dispatch} />;
}

function Status({ room }: { room?: Room }) {
  if (!room) return null;
  const text =
    room.status === 'online'
      ? room.role === 'host'
        ? `Live · hosting · ${room.peers} ${room.peers === 1 ? 'phone' : 'phones'} connected`
        : 'Live · connected to host'
      : room.status === 'connecting'
        ? 'Connecting…'
        : room.error || 'Offline';
  return (
    <div className="small" style={{ color: room.status === 'online' ? 'var(--ok)' : room.status === 'connecting' ? 'var(--text-muted)' : 'var(--danger)', marginBottom: 6 }}>
      ● {text}
    </div>
  );
}

function Lobby({ game, state, room, dispatch }: { game: SavedGame; state: LiveState; room?: Room; dispatch: (a: LiveAction) => void }) {
  const isHost = game.live?.role === 'host';
  const myId = game.live!.myId;
  const url = joinUrl(state.room);
  const qr = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    return q.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  }, [url]);
  const need = state.mode === '2v2' ? 4 : 2;
  const teamsOk = state.players.filter((p) => p.team === 'A').length === need / 2 && state.players.filter((p) => p.team === 'B').length === need / 2;
  const [layoutOpen, setLayoutOpen] = useState(false);

  return (
    <Screen title="Live game · Lobby" back>
      <Status room={room} />
      {isHost && (
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div className="muted small">Room code</div>
          <div className="big-num" style={{ letterSpacing: '0.2em' }}>
            {state.room}
          </div>
          <div style={{ background: '#fff', padding: 10, borderRadius: 12, width: 210, margin: '10px auto' }} dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code to join" />
          <div className="muted small">Other players scan this with their phone camera, or open Play → Join and type the code.</div>
        </div>
      )}
      {!isHost && <p className="muted small">Joined room {state.room}. The host starts the game.</p>}

      <div className="section-label">Game type</div>
      <div className="filters">
        {(['1v1', '2v2'] as const).map((m) => (
          <button key={m} className={`filter ${state.mode === m ? 'on' : ''}`} disabled={!isHost} onClick={() => dispatch({ t: 'setMode', mode: m })}>
            {m}
          </button>
        ))}
      </div>

      {(['A', 'B'] as Team[]).map((team) => (
        <div key={team}>
          <div className="section-label">Team {team}</div>
          <div className="card">
            {state.players
              .filter((p) => p.team === team)
              .map((p) => (
                <div key={p.id} className="row">
                  <span style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      {p.name}
                      {p.id === state.hostId ? <span className="tag"> · HOST</span> : null}
                      {p.id === myId ? <span className="tag"> · YOU</span> : null}
                    </div>
                    <div className="muted small">
                      {p.army} · {p.faction}
                      {p.detachments.length ? ` · ${p.detachments.join(', ')}` : ''}
                    </div>
                  </span>
                  {(isHost || p.id === myId) && (
                    <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ t: 'setTeam', id: p.id, team: otherTeam(team) })}>
                      Move to {otherTeam(team)}
                    </button>
                  )}
                </div>
              ))}
            {state.players.filter((p) => p.team === team).length === 0 && <div className="row muted small">Waiting for players…</div>}
          </div>
        </div>
      ))}

      <div className="section-label">Mission</div>
      {isHost ? (
        <>
          <label className="field">
            <span>Mission</span>
            <input className="input" defaultValue={state.mission ?? ''} onBlur={(e) => dispatch({ t: 'setMission', mission: e.target.value })} />
          </label>
          <label className="field">
            <span>Deployment / layout</span>
            <input className="input" defaultValue={state.deployment ?? ''} onBlur={(e) => dispatch({ t: 'setMission', deployment: e.target.value })} />
          </label>
          <button className="btn btn-sm" onClick={() => setLayoutOpen(true)}>
            Pick a saved layout
          </button>
          <div className="section-label">Goes first</div>
          <div className="filters">
            {(['A', 'B'] as Team[]).map((t) => (
              <button key={t} className={`filter ${state.firstTurn === t ? 'on' : ''}`} onClick={() => dispatch({ t: 'setFirst', team: t })}>
                {teamNames(state, t)}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn btn-primary btn-block" disabled={!teamsOk} onClick={() => dispatch({ t: 'start' })}>
              {teamsOk ? 'Start battle' : `Waiting for ${need} players (${need / 2} per team)`}
            </button>
          </div>
        </>
      ) : (
        <p className="small">
          {state.mission || 'Mission not set yet'}
          {state.deployment ? ` · ${state.deployment}` : ''} · first turn: {teamNames(state, state.firstTurn)}
        </p>
      )}
      <LayoutPicker open={layoutOpen} onClose={() => setLayoutOpen(false)} onPick={(name) => dispatch({ t: 'setMission', deployment: name })} />
      <LeaveButton game={game} />
    </Screen>
  );
}

function LeaveButton({ game }: { game: SavedGame }) {
  const navigate = useNavigate();
  const [sure, setSure] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-danger btn-block"
      onClick={async () => {
        if (!sure) return setSure(true);
        closeRoom(game.id);
        await db.games.delete(game.id);
        navigate('/play', { replace: true });
      }}
    >
      {sure ? 'Tap again to leave and delete this game' : 'Leave game'}
    </button>
  );
}

function LiveBattle({ game, state, room, engine, dispatch }: { game: SavedGame; state: LiveState; room?: Room; engine?: RosterEngine; dispatch: (a: LiveAction) => void }) {
  const myId = game.live!.myId;
  const isHost = game.live?.role === 'host';
  const me = state.players.find((p) => p.id === myId)!;
  const myTeam = me.team;
  const [tab, setTab] = useState<'phase' | 'units' | 'score' | 'log'>('phase');
  const [note, setNote] = useState('');
  const [ending, setEnding] = useState(false);
  const myTurn = state.turn === myTeam;
  const n = nextPhase({ round: state.round, turn: state.turn === state.firstTurn ? 'me' : 'them', phase: state.phase }, 'me');
  const nextTeam: Team = n.turn === 'me' ? state.firstTurn : otherTeam(state.firstTurn);
  const nextText = n.gameOver ? 'end of game' : nextTeam !== state.turn ? `${teamNames(state, nextTeam)}'s turn` : PHASE_NAMES[n.phase];
  const myUnits = useMemo(() => (engine ? unitsLeft(engine, game.casualties) : []), [engine, game.casualties]);
  const usedThisPhase = useLiveQuery(() => db.games.get(game.id).then((g) => g?.used ?? []), [game.id]);

  return (
    <Screen
      title={`Round ${state.round}`}
      back
      actions={
        isHost ? (
          <button className="btn btn-sm btn-ghost" onClick={() => setEnding(true)}>
            End
          </button>
        ) : undefined
      }
    >
      <Status room={room} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 600 }}>{myTurn ? `Your ${state.mode === '2v2' ? "team's " : ''}turn` : `${teamNames(state, state.turn)}'s turn`}</span>
        <span className="spacer" />
        <span className="num">
          VP {totalScore(state.vp[myTeam])}–{totalScore(state.vp[otherTeam(myTeam)])}
        </span>
      </div>
      <div className="filters" style={{ marginTop: 6 }}>
        {PHASES.map((p) => (
          <button key={p} className={`filter ${state.phase === p ? 'on' : ''}`} onClick={() => dispatch({ t: 'phase', phase: p })}>
            {PHASE_NAMES[p]}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 12 }}>
        {[...state.players].sort((a, b) => (a.team === myTeam ? -1 : 1) - (b.team === myTeam ? -1 : 1)).map((p) => (
          <div key={p.id} className="counter" style={{ marginTop: 4 }}>
            <span>
              {p.id === myId ? 'Your CP' : `${p.name} CP`} <span className="muted small">· Team {p.team}</span>
            </span>
            <Stepper value={state.cp[p.id] ?? 0} onChange={(v) => dispatch({ t: 'cp', id: p.id, value: v })} label={`${p.name} CP`} />
          </div>
        ))}
      </div>
      <div className="btn-row">
        <button className="btn" onClick={() => dispatch({ t: 'prev' })}>
          ‹
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => (n.gameOver ? isHost && setEnding(true) : dispatch({ t: 'next' }))} disabled={n.gameOver && !isHost}>
          Next: {nextText}
        </button>
      </div>

      <div className="seg" role="tablist">
        {(['phase', 'units', 'score', 'log'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)}>
            {t === 'phase' ? PHASE_NAMES[state.phase] : t === 'units' ? 'Units' : t === 'score' ? 'Score' : 'Log'}
          </button>
        ))}
      </div>

      {tab === 'phase' && (
        <PhasePanel
          engine={engine}
          phase={state.phase}
          myTurn={myTurn}
          onSpend={(s, cost) => {
            const again = (usedThisPhase ?? []).some((u) => u.id === s.id && u.round === state.round && u.phase === state.phase);
            void db.games.update(game.id, { used: [...(usedThisPhase ?? []), { round: state.round, turn: myTurn ? 'me' : 'them', phase: state.phase, id: s.id, name: s.name }] });
            dispatch({ t: 'strat', name: again ? `${s.name} (again this phase!)` : s.name, cost });
          }}
        />
      )}

      {tab === 'units' && (
        <>
          <div className="section-label">Your units</div>
          <UnitsPanel gameId={game.id} units={myUnits} />
          {state.players
            .filter((p) => p.id !== myId)
            .map((p) => (
              <div key={p.id}>
                <div className="section-label">
                  {p.name} · {p.army} {p.team === myTeam ? '(teammate)' : ''}
                </div>
                <SummaryList units={state.units[p.id] ?? []} />
              </div>
            ))}
        </>
      )}

      {tab === 'score' && (
        <div className="card" style={{ padding: 12 }}>
          {([myTeam, otherTeam(myTeam)] as Team[]).map((team) => (
            <div key={team} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {teamNames(state, team)} · {totalScore(state.vp[team])} VP
              </div>
              <div className="score-grid">
                <span />
                {Array.from({ length: ROUNDS }, (_, i) => (
                  <span key={i} className="small muted">
                    R{i + 1}
                  </span>
                ))}
                <span />
                {(['primary', 'secondary'] as const).map((kind) => (
                  <ScoreRow key={kind} label={kind === 'primary' ? 'Pri' : 'Sec'} values={state.vp[team][kind]} onChange={(r, v) => dispatch({ t: 'vp', team, kind, round: r, value: v })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'log' && (
        <>
          <div className="btn-row">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for everyone" style={{ flex: 1 }} />
            <button className="btn btn-sm" disabled={!note.trim()} onClick={() => (dispatch({ t: 'note', text: note }), setNote(''))}>
              Add
            </button>
          </div>
          <div className="card">
            {[...state.log].reverse().map((l, i) => (
              <div key={i} className="row small">
                <span className="muted" style={{ width: 54 }}>
                  R{l.round} {PHASE_NAMES[l.phase].slice(0, 3)}
                </span>
                <span style={{ flex: 1 }}>
                  {l.text}
                  {l.by && !l.text.startsWith(l.by) ? <span className="muted"> · {l.by}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <Sheet open={ending} onClose={() => setEnding(false)} title="End the game for everyone?">
        <p>
          Final score {teamNames(state, 'A')} {totalScore(state.vp.A)} – {totalScore(state.vp.B)} {teamNames(state, 'B')}.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => (dispatch({ t: 'end' }), setEnding(false))}>
          Finish and save
        </button>
      </Sheet>
    </Screen>
  );
}

function LiveResult({ game, state, room, dispatch }: { game: SavedGame; state: LiveState; room?: Room; dispatch: (a: LiveAction) => void }) {
  const navigate = useNavigate();
  const isHost = game.live?.role === 'host';
  const myTeam = state.players.find((p) => p.id === game.live!.myId)?.team ?? 'A';
  const result = state.winner === 'draw' ? 'DRAW' : state.winner === myTeam ? 'WIN' : 'LOSS';
  return (
    <Screen title="Result" back>
      <Status room={room} />
      <div className="big-num" style={{ textAlign: 'center', margin: '12px 0' }}>
        {totalScore(state.vp[myTeam])} – {totalScore(state.vp[otherTeam(myTeam)])}
      </div>
      <p className="tag" style={{ textAlign: 'center' }}>
        {result} · {teamNames(state, myTeam)} vs {teamNames(state, otherTeam(myTeam))}
      </p>
      <p className="small muted" style={{ textAlign: 'center' }}>
        {state.mode} · {state.mission || 'mission not set'}
        {state.deployment ? ` · ${state.deployment}` : ''}
      </p>
      <label className="field">
        <span>Your notes</span>
        <textarea className="input" defaultValue={game.notes ?? ''} onBlur={(e) => db.games.update(game.id, { notes: e.target.value })} />
      </label>
      <div className="section-label">Log</div>
      <div className="card">
        {state.log.map((l, i) => (
          <div key={i} className="row small">
            <span className="muted" style={{ width: 30 }}>
              R{l.round}
            </span>
            <span style={{ flex: 1 }}>{l.text}</span>
          </div>
        ))}
      </div>
      <div className="btn-row">
        {isHost && (
          <button className="btn" onClick={() => dispatch({ t: 'reopen' })}>
            Reopen game
          </button>
        )}
        <button
          className="btn btn-ghost"
          onClick={() => {
            closeRoom(game.id);
            navigate('/play');
          }}
        >
          Close
        </button>
      </div>
    </Screen>
  );
}
