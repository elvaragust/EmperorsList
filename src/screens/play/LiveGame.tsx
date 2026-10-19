import { useLiveQuery } from 'dexie-react-hooks';
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type SavedGame } from '@/data/db';
import { PHASE_NAMES, PHASES, ROUNDS, totalScore } from '@/engine/game';
import { canAdvance, LOCAL, MODES, missionsOf, opponentsOf, reduce, teamNames, teamsOf, teamsReady, turnOrder, vpOf, type LiveAction, type LiveMode, type LiveState, type Team } from '@/engine/live';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import { allowedDispositions } from '@/engine/rules/config';
import type { SecOp } from '@/engine/missions';
import { closeRoom, joinUrl, type Room } from '@/sync/room';
import { useRoom } from '@/sync/useRoom';
import { Screen } from '@/ui/Screen';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';
import { Icon } from '@/ui/Icon';
import { showToast } from '@/ui/Toast';
import { useSessionState } from '@/ui/useSessionState';
import { NotesPanel } from './panels';
import { ScoreRow } from './GameScreen';
import { PhasePanel, RoundBar, RulesPanel, TurnBanner, SummaryList, toSummaries, unitsLeft, UnitsPanel } from './panels';
import { MissionFields } from './MissionFields';
import { MissionsPanel, SecondarySetup } from './secondaries';
import { OpponentUnits } from './OpponentUnits';

/** A game played live across phones (1v1, 2v2, 2v1 or three players). The host's phone is the referee. */
export function LiveGame({ game, engine }: { game: SavedGame; engine?: RosterEngine }) {
  const room = useRoom(game);
  const state = game.live?.state;
  const myId = game.live!.myId;
  const unlinked = Boolean(game.live?.unlinked);
  const dispatch = (a: LiveAction) => {
    if (!unlinked) return room?.dispatch(a);
    // Offline copy: apply locally, you may change everything.
    if (!state || !game.live) return;
    const next = reduce(state, a, LOCAL);
    if (next === state) return;
    const myTeam = next.players.find((p) => p.id === myId)?.team;
    void db.games.update(game.id, {
      live: { ...game.live, state: next },
      round: next.round,
      stage: next.stage === 'lobby' ? 'setup' : next.stage,
      result: next.stage === 'done' ? (next.winner === 'draw' ? 'draw' : next.winner === myTeam ? 'win' : 'loss') : game.result,
    });
  };

  // Share how many models (and points) each of my units has left, so the other players can see it.
  const mine = useMemo(() => (engine ? toSummaries(unitsLeft(engine, game.casualties)) : undefined), [engine, game.casualties]);
  const sent = JSON.stringify(state?.units[myId] ?? null);
  useEffect(() => {
    if (!mine || !state || state.stage === 'lobby' || room?.status !== 'online') return;
    if (JSON.stringify(mine) !== sent) dispatch({ t: 'units', units: mine });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, sent, state?.stage, room?.status]);

  // Tell the others which Force Dispositions my list allows (a team picks from both lists).
  const allowed = useMemo(() => (engine ? allowedDispositions(engine).map((d) => d.name) : undefined), [engine]);
  const meNow = state?.players.find((p) => p.id === myId);
  useEffect(() => {
    if (!allowed || !meNow || !game.live || room?.status !== 'online' || unlinked) return;
    if (JSON.stringify(meNow.allowed ?? []) === JSON.stringify(allowed)) return;
    dispatch({ t: 'join', player: { ...game.live.me, allowed } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, meNow?.allowed, room?.status]);

  if (!state) {
    return (
      <Screen title="Joining…" back="/play">
        <Status room={room} />
        <p className="muted">Waiting for the host's game. Keep this screen open.</p>
      </Screen>
    );
  }
  const me = state.players.find((p) => p.id === myId);
  if (!me && state.stage !== 'lobby') {
    return (
      <Screen title="Live game" back="/play">
        <p className="issue-title">This game started without you.</p>
      </Screen>
    );
  }
  if (state.stage === 'lobby') return <Lobby game={game} state={state} room={room} dispatch={dispatch} allowed={allowed} />;
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

/** Players on a team. */
const membersOf = (state: LiveState, team: Team) => state.players.filter((p) => p.team === team);

function Lobby({ game, state, room, dispatch, allowed }: { game: SavedGame; state: LiveState; room?: Room; dispatch: (a: LiveAction) => void; allowed?: string[] }) {
  const isHost = game.live?.role === 'host';
  const myId = game.live!.myId;
  const url = joinUrl(state.room);
  const qr = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    return q.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  }, [url]);
  const mode = MODES[state.mode];
  const teams = teamsOf(state);
  const ready = teamsReady(state);
  const me = state.players.find((p) => p.id === myId);
  const twoSides = teams.length === 2;
  const myRole = twoSides && state.attacker && me ? (state.attacker === me.team ? 'attacker' : 'defender') : undefined;
  const team = me ? membersOf(state, me.team) : [];
  const opponents = me ? state.players.filter((p) => p.team !== me.team) : [];
  // A team plays one disposition: what either teammate's list allows.
  const teamAllowed = useMemo(() => {
    if (!me) return allowed;
    const lists = team.map((p) => (p.id === myId ? allowed : p.allowed)).filter((l): l is string[] => Boolean(l?.length));
    return lists.length ? [...new Set(lists.flat())] : allowed;
  }, [me, team, allowed, myId]);
  // Keep this phone's copy in step, so the secondary deck uses the right cards.
  useEffect(() => {
    if (myRole && game.role !== myRole) void db.games.update(game.id, { role: myRole });
  }, [myRole, game.role, game.id]);
  const sec = me ? missionsOf(state, me.team) : undefined;
  const missionValue = { mission: me?.primary, deployment: state.deployment, twist: state.twist, disposition: me?.disposition, manualPrimary: me?.manualPrimary };

  return (
    <Screen title="Live game · Lobby" back="/play">
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
        {(Object.keys(MODES) as LiveMode[]).map((m) => (
          <button key={m} className={`filter ${state.mode === m ? 'on' : ''}`} disabled={!isHost} onClick={() => dispatch({ t: 'setMode', mode: m })}>
            {MODES[m].label}
          </button>
        ))}
      </div>
      {mode.sizes.some((n) => n > 1) && (
        <button className="choice" role="switch" aria-checked={Boolean(state.sharedCp)} disabled={!isHost} onClick={() => dispatch({ t: 'setSharedCp', on: !state.sharedCp })}>
          <span style={{ flex: 1 }}>
            Teammates share CP
            <div className="muted small">One CP pool per team: either teammate spends from it, both see the same number</div>
          </span>
          <span className={`switch ${state.sharedCp ? 'on' : ''}`} aria-hidden="true" />
        </button>
      )}

      {teams.map((t) => (
        <div key={t}>
          <div className="section-label">
            Team {t}
            {state.mode === '2v1' && ready ? ` · ${membersOf(state, t).length === 2 ? 'the pair' : 'solo'}` : ''}
          </div>
          <div className="card">
            {membersOf(state, t).map((p) => (
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
                    {p.disposition ? ` · ${p.disposition}` : ''}
                  </div>
                </span>
                {(isHost || p.id === myId) &&
                  teams
                    .filter((x) => x !== t)
                    .map((x) => (
                      <button key={x} className="btn btn-sm btn-ghost" onClick={() => dispatch({ t: 'setTeam', id: p.id, team: x })}>
                        To {x}
                      </button>
                    ))}
              </div>
            ))}
            {membersOf(state, t).length === 0 && <div className="row muted small">Waiting for players…</div>}
          </div>
        </div>
      ))}

      <div className="section-label">Missions</div>
      {me && (
        <MissionFields
          value={missionValue}
          primaryOnly={!isHost}
          onChange={(v) => {
            if (isHost && (v.deployment !== state.deployment || v.twist !== state.twist)) dispatch({ t: 'setMission', deployment: v.deployment ?? '', twist: v.twist ?? '' });
            if (v.disposition !== me.disposition || v.manualPrimary !== me.manualPrimary || (v.manualPrimary && v.mission !== me.primary))
              dispatch({ t: 'setPrimary', disposition: v.disposition ?? '', mission: v.mission, manual: Boolean(v.manualPrimary) });
          }}
          disposition={me.disposition}
          allowed={teamAllowed}
          opponents={opponents.map((p) => ({ name: p.name, disposition: p.disposition }))}
          teamNote={team.length > 1 ? 'Your team plays one Force Disposition and one primary — either of you can set it; the list shows what both your lists allow.' : undefined}
        />
      )}
      {!isHost && <MissionFields readOnly value={{ deployment: state.deployment, twist: state.twist }} onChange={() => undefined} />}
      <PrimariesList state={state} />
      {isHost ? (
        <>
          <div className="section-label">Goes first</div>
          <div className="filters">
            {teams.map((t) => (
              <button key={t} className={`filter ${state.firstTurn === t ? 'on' : ''}`} onClick={() => dispatch({ t: 'setFirst', team: t })}>
                {teamNames(state, t)}
              </button>
            ))}
          </div>
          {teams.length > 2 && <p className="small muted">Then {turnOrder(state).slice(1).map((t) => teamNames(state, t)).join(', then ')}.</p>}
        </>
      ) : (
        <p className="small">Turn order: {turnOrder(state).map((t) => teamNames(state, t)).join(' → ')}</p>
      )}
      {twoSides && (
        <>
          <div className="section-label">Attacker or Defender?</div>
          <p className="small muted" style={{ marginTop: 0 }}>Roll off after the deployment card; the winner sets it here for both sides.</p>
          <div className="seg" role="radiogroup">
            {(['attacker', 'defender'] as const).map((r) => (
              <button key={r} role="radio" aria-checked={myRole === r} className={myRole === r ? 'on' : undefined} disabled={!me} onClick={() => me && dispatch({ t: 'setAttacker', team: r === 'attacker' ? me.team : opponentsOf(state, me.team)[0]! })}>
                {team.length > 1 ? (r === 'attacker' ? 'We attack' : 'We defend') : r === 'attacker' ? 'I attack' : 'I defend'}
              </button>
            ))}
          </div>
          {state.attacker && (
            <p className="small">
              Attacker: {teamNames(state, state.attacker)} · Defender: {teamNames(state, opponentsOf(state, state.attacker)[0]!)}
            </p>
          )}
        </>
      )}
      {me && sec && (
        <SecondarySetup
          sec={sec}
          role={myRole}
          title={team.length > 1 ? 'Our secondaries (shared with your teammate)' : 'My secondaries'}
          onSec={(op) => dispatch({ t: 'sec', team: me.team, op })}
        />
      )}
      {isHost && (
        <div className="btn-row">
          <button className="btn btn-primary btn-block" disabled={!ready} onClick={() => dispatch({ t: 'start' })}>
            {ready ? 'Start battle' : `Waiting for ${mode.players} players (${mode.label})`}
          </button>
        </div>
      )}
      <LeaveButton game={game} />
    </Screen>
  );
}

/** Each player's primary mission. */
function PrimariesList({ state }: { state: LiveState }) {
  const set = state.players.filter((p) => p.primary || p.disposition);
  if (!set.length) return null;
  return <p className="small muted">Primaries: {state.players.map((p) => `${p.name}: ${p.primary ?? '—'}`).join(' · ')}</p>;
}

function LeaveButton({ game }: { game: SavedGame }) {
  const navigate = useNavigate();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-danger btn-block" onClick={() => setAsk(true)}>
        Leave game
      </button>
      <ConfirmSheet
        open={ask}
        onClose={() => setAsk(false)}
        title="Leave this game?"
        message={game.live?.role === 'host' ? 'You are the host: the room closes for everyone and the game is deleted from this phone.' : 'You leave the room and the game is deleted from this phone. You can join again with the room code.'}
        confirm="Leave game"
        danger
        onConfirm={async () => {
          closeRoom(game.id);
          await db.games.delete(game.id);
          navigate('/play', { replace: true });
        }}
      />
    </>
  );
}

function LiveBattle({ game, state, room, engine, dispatch }: { game: SavedGame; state: LiveState; room?: Room; engine?: RosterEngine; dispatch: (a: LiveAction) => void }) {
  const myId = game.live!.myId;
  const unlinked = Boolean(game.live?.unlinked);
  // A guest cut off from the host plays on with every change allowed; its team's changes sync when the host is back.
  const cutOff = Boolean(room?.cutOff) && !unlinked;
  const free = unlinked || cutOff;
  const isHost = game.live?.role === 'host' || unlinked;
  const me = state.players.find((p) => p.id === myId)!;
  const myTeam = me.team;
  const teams = teamsOf(state);
  const others = opponentsOf(state, myTeam);
  const [tab, setTab] = useSessionState<'phase' | 'missions' | 'rules' | 'units' | 'score' | 'log'>(`battle-tab:${game.id}`, 'phase');
  const [note, setNote] = useState('');
  const [ending, setEnding] = useState(false);
  const [menu, setMenu] = useState(false);
  // What I'm looking at is mine; the game's current phase is shared.
  // Kept when you open a unit and come back; follows the game when the shared phase moves on.
  const stamp = `${state.round}-${state.turn}-${state.phase}`;
  const [view, setView] = useSessionState(`battle-view:${game.id}`, { phase: state.phase, seen: stamp });
  useEffect(() => {
    if (view.seen !== stamp) setView({ phase: state.phase, seen: stamp });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);
  const viewPhase = view.seen === stamp ? view.phase : state.phase;
  const setViewPhase = (p: typeof state.phase) => setView({ phase: p, seen: stamp });
  const myTurn = state.turn === myTeam;
  const mayAdvance = free || canAdvance(state, myId);
  const order = turnOrder(state);
  const lastTurn = order.indexOf(state.turn) === order.length - 1;
  const gameOver = state.phase === 'fight' && lastTurn && state.round >= ROUNDS;
  const nextText = gameOver ? 'end of game' : state.phase === 'fight' ? `${teamNames(state, lastTurn ? order[0]! : order[order.indexOf(state.turn) + 1]!)}'s turn` : PHASE_NAMES[PHASES[PHASES.indexOf(state.phase) + 1]!];
  const myUnits = useMemo(() => (engine ? unitsLeft(engine, game.casualties) : []), [engine, game.casualties]);
  const usedThisPhase = useLiveQuery(() => db.games.get(game.id).then((g) => g?.used ?? []), [game.id]);
  const mine = (id: string) => free || id === myId;
  const myScore = totalScore(vpOf(state, myTeam));
  const best = Math.max(...others.map((t) => totalScore(vpOf(state, t))));
  // With a shared pool, one CP counter per team; otherwise one per player.
  const cpRows = state.sharedCp
    ? [myTeam, ...others].filter((t) => membersOf(state, t).length).map((t) => ({ key: t, label: t === myTeam ? (membersOf(state, t).length > 1 ? 'Our CP' : 'Your CP') : `${teamNames(state, t)} CP`, id: membersOf(state, t)[0]!.id, editable: free || t === myTeam }))
    : [...state.players].sort((a, b) => Number(b.team === myTeam) - Number(a.team === myTeam)).map((p) => ({ key: p.id, label: p.id === myId ? 'Your CP' : `${p.name} CP`, id: p.id, editable: mine(p.id), team: p.team }));
  const secOf = (t: Team) => missionsOf(state, t);
  const primaryOfTeam = (t: Team) => membersOf(state, t).find((p) => p.primary)?.primary ?? (t === myTeam ? state.mission : undefined);

  const unlink = async () => {
    setMenu(false);
    // Mark it unlinked first so nothing reopens the connection, then hang up.
    await db.games.update(game.id, { live: { ...game.live!, unlinked: true } });
    closeRoom(game.id);
    showToast('Live changes off — this game is now only on your phone');
  };
  const endHere = async () => {
    setMenu(false);
    const done = reduce(state, { t: 'end' }, LOCAL);
    const winner = done.winner;
    await db.games.update(game.id, {
      live: { ...game.live!, unlinked: true, state: done },
      stage: 'done',
      finishedAt: Date.now(),
      result: winner === 'draw' ? 'draw' : winner === myTeam ? 'win' : 'loss',
    });
    closeRoom(game.id);
  };
  const relink = async () => {
    setMenu(false);
    await db.games.update(game.id, { live: { ...game.live!, unlinked: false } });
    showToast('Reconnecting to the live game…');
  };

  return (
    <Screen
      title={`Round ${state.round}`}
      back="/play"
      actions={
        <button className="icon-btn" aria-label="Game menu" onClick={() => setMenu(true)}>
          <Icon name="more" />
        </button>
      }
    >
      {unlinked ? (
        <div className="small" style={{ color: 'var(--accent)', marginBottom: 6 }}>
          ● Offline copy — you can change everything. The other players' armies are kept as they were.
        </div>
      ) : (
        <>
          <Status room={room} />
          {cutOff && (
            <div className="offline-note small" role="status">
              <strong>Playing on without the host.</strong> Everything works on this phone. When the host is back, your team's CP, score, missions and the turn are sent over; the other team's numbers come from the host.
            </div>
          )}
        </>
      )}
      <div className="game-layout">
        <div className="game-controls">
          <RoundBar round={state.round} disabled={!mayAdvance} onPick={(r) => dispatch({ t: 'round', round: r })} />
          <TurnBanner
            mine={myTurn}
            label={myTurn ? `Your ${membersOf(state, myTeam).length > 1 ? "team's " : ''}turn` : `${teamNames(state, state.turn)}'s turn`}
            phase={PHASE_NAMES[state.phase]}
            vp={`${myScore}–${best}`}
            onSwitch={mayAdvance ? () => dispatch({ t: 'turn' }) : undefined}
            switchTo={teamNames(state, order[(order.indexOf(state.turn) + 1) % order.length]!)}
          />
          <div className="phase-strip" aria-label="Look at a phase (only on your screen)">
            {PHASES.map((p) => (
              <button key={p} className={`filter ${viewPhase === p ? 'on' : ''}`} onClick={() => setViewPhase(p)}>
                {PHASE_NAMES[p]}
                {p === state.phase ? ' •' : ''}
              </button>
            ))}
          </div>
          <div className="card cp-card">
            {cpRows.map((r) => (
              <div key={r.key} className="counter" style={{ marginTop: 4 }}>
                <span>
                  {r.label}
                  {'team' in r && r.team ? <span className="muted small"> · Team {r.team}</span> : null}
                </span>
                {r.editable ? (
                  <Stepper value={state.cp[r.id] ?? 0} onChange={(v) => dispatch({ t: 'cp', id: r.id, value: v })} label={r.label} />
                ) : (
                  <span className="num" style={{ fontSize: 20, padding: '0 14px' }}>
                    {state.cp[r.id] ?? 0}
                  </span>
                )}
              </div>
            ))}
          </div>
          
          <NotesPanel gameId={game.id} notes={game.notes} />
        </div>

        <div className="game-main">
          <div className="seg" role="tablist">
            {(['phase', 'missions', 'units', 'score', 'rules', 'log'] as const).map((t) => (
              <button key={t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)}>
                {t === 'phase' ? PHASE_NAMES[viewPhase] : t === 'missions' ? 'Missions' : t === 'rules' ? 'Rules' : t === 'units' ? 'Units' : t === 'score' ? 'Score' : 'Log'}
              </button>
            ))}
          </div>

          {tab === 'rules' && <RulesPanel engine={engine} />}

          {tab === 'missions' && (
            <>
              <MissionsPanel
                sec={secOf(myTeam)}
                onSec={(op: SecOp, text?: string) => dispatch({ t: 'sec', team: myTeam, op, text })}
                round={state.round}
                turnKey={`${state.round}-${state.turn}`}
                myCommandPhase={myTurn && state.phase === 'command'}
                primary={primaryOfTeam(myTeam)}
                twist={state.twist}
                role={game.role}
                onCp={(d) => dispatch({ t: 'cp', id: myId, value: Math.max(0, (state.cp[myId] ?? 0) + d) })}
                onVp={(kind, vp) => {
                  const cur = vpOf(state, myTeam);
                  const i = Math.min(state.round, cur[kind].length) - 1;
                  dispatch({ t: 'vp', team: myTeam, kind, round: i, value: (cur[kind][i] ?? 0) + vp });
                  showToast(`+${vp} VP added to round ${state.round}`);
                }}
              />
              {others.map((t) => (
                <div key={t} className="opp-missions">
                  <MissionsPanel readOnly who={`${teamNames(state, t)}'s`} sec={secOf(t)} round={state.round} turnKey="" myCommandPhase={false} primary={primaryOfTeam(t)} />
                </div>
              ))}
            </>
          )}

          {tab === 'phase' && (
            <PhasePanel
              engine={engine}
              phase={viewPhase}
              myTurn={myTurn}
              cp={state.cp[myId] ?? 0}
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
                    {p.list ? <OpponentUnits game={game} playerId={p.id} summary={state.units[p.id]} /> : <SummaryList units={state.units[p.id] ?? []} />}
                  </div>
                ))}
            </>
          )}

          {tab === 'score' && (
            <div className="card" style={{ padding: 12 }}>
              {[myTeam, ...others].map((team) => (
                <div key={team} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    {teamNames(state, team)} · {totalScore(vpOf(state, team))} VP
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
                      <ScoreRow
                        key={kind}
                        label={kind === 'primary' ? 'Pri' : 'Sec'}
                        values={vpOf(state, team)[kind]}
                        readOnly={!free && team !== myTeam}
                        onChange={(r, v) => dispatch({ t: 'vp', team, kind, round: r, value: v })}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {!unlinked && <p className="small muted">Each team enters its own score; you see the others' as they type it.</p>}
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
        </div>
      </div>

      <div className="sticky-bar battle-bar">
            <button className="btn" onClick={() => dispatch({ t: 'prev' })} disabled={!mayAdvance} aria-label="Previous phase">
              <Icon name="back" />
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => (gameOver ? isHost && setEnding(true) : dispatch({ t: 'next' }))} disabled={!mayAdvance || (gameOver && !isHost)}>
              {mayAdvance ? `Next: ${nextText}` : `${teamNames(state, state.turn)} moves the turn on`}
            </button>
          </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title="Game">
        {isHost ? (
          <button className="menu-item" onClick={() => (setMenu(false), setEnding(true))}>
            End the game{unlinked ? '' : ' for everyone'}
          </button>
        ) : (
          <button className="menu-item" onClick={endHere}>
            <span>
              End the game on my phone
              <div className="muted small">Saves the result here and stops following the host. The others carry on.</div>
            </span>
          </button>
        )}
        {!unlinked ? (
          <button className="menu-item" onClick={unlink}>
            <span>
              Turn off live changes
              <div className="muted small">Unlinks this phone. You keep everyone's army and score as they are now, and can change anything yourself.</div>
            </span>
          </button>
        ) : (
          <button className="menu-item" onClick={relink}>
            <span>
              Reconnect to the live game
              <div className="muted small">{game.live?.role === 'host' ? 'Others can rejoin; your offline changes are kept.' : "The host's game replaces your offline changes."}</div>
            </span>
          </button>
        )}
      </Sheet>

      <Sheet open={ending} onClose={() => setEnding(false)} title={unlinked ? 'End the game?' : 'End the game for everyone?'}>
        <p>Final score {teams.map((t) => `${teamNames(state, t)} ${totalScore(vpOf(state, t))}`).join(' – ')}.</p>
        <button className="btn btn-primary btn-block" onClick={() => (dispatch({ t: 'end' }), setEnding(false))}>
          Finish and save
        </button>
      </Sheet>
    </Screen>
  );
}

function LiveResult({ game, state, room, dispatch }: { game: SavedGame; state: LiveState; room?: Room; dispatch: (a: LiveAction) => void }) {
  const navigate = useNavigate();
  const [askDelete, setAskDelete] = useState(false);
  const isHost = game.live?.role === 'host';
  const myTeam = state.players.find((p) => p.id === game.live!.myId)?.team ?? 'A';
  const result = state.winner === 'draw' ? 'DRAW' : state.winner === myTeam ? 'WIN' : 'LOSS';
  const others = opponentsOf(state, myTeam);
  return (
    <Screen title="Result" back="/play">
      <Status room={room} />
      <div className="big-num" style={{ textAlign: 'center', margin: '12px 0' }}>
        {[myTeam, ...others].map((t) => totalScore(vpOf(state, t))).join(' – ')}
      </div>
      <p className="tag" style={{ textAlign: 'center' }}>
        {result} · {teamNames(state, myTeam)} vs {others.map((t) => teamNames(state, t)).join(' vs ')}
      </p>
      <p className="small muted" style={{ textAlign: 'center' }}>
        {MODES[state.mode]?.label ?? state.mode} · {state.players.find((p) => p.team === myTeam)?.primary || state.mission || 'mission not set'}
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
        <button className="btn btn-ghost btn-danger" onClick={() => setAskDelete(true)}>
          Delete game
        </button>
      </div>
      <ConfirmSheet
        open={askDelete}
        onClose={() => setAskDelete(false)}
        title="Delete this game?"
        message="Its result and log are removed from this phone. The other players keep their copies."
        confirm="Delete game"
        danger
        onConfirm={() => {
          closeRoom(game.id);
          void db.games.delete(game.id).then(() => navigate('/play', { replace: true }));
        }}
      />
    </Screen>
  );
}
