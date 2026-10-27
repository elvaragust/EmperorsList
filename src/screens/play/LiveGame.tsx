import { useLiveQuery } from 'dexie-react-hooks';
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type SavedGame } from '@/data/db';
import { PHASE_NAMES, PHASES, ROUNDS, totalScore } from '@/engine/game';
import { canAdvance, LOCAL, MODES, missionsOf, opponentsOf, reduce, stampOf, teamNames, teamsOf, teamsReady, turnOrder, vpOf, type LiveAction, type LiveMode, type LiveState, type Team } from '@/engine/live';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import { allowedDispositions } from '@/engine/rules/config';
import type { SecOp } from '@/engine/missions';
import { applyUnlinked, closeRoom, continueAsHost, joinUrl, liveOf, moveToRoom, type Room } from '@/sync/room';
import { useRoom } from '@/sync/useRoom';
import { Screen } from '@/ui/Screen';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { Icon } from '@/ui/Icon';
import { showToast } from '@/ui/Toast';
import { useSessionState } from '@/ui/useSessionState';
import { NotesPanel } from './panels';
import { useHealthRecorder } from './games';
import { ScoreRow } from './GameScreen';
import { BattleTabs, CpBar, healthOf, PhasePanel, PhaseStrip, RoundBar, RulesPanel, TurnBanner, SummaryList, toSummaries, unitsLeft, UnitsPanel } from './panels';
import { MissionFields } from './MissionFields';
import { MissionRoundPicker, MissionsPanel, SecondarySetup, useViewRound } from './secondaries';
import { OpponentUnits } from './OpponentUnits';
import { gameDuration, ResultLog, ResultView } from './ResultView';

/** A game played live across phones (1v1, 2v2, 2v1 or three players). The host's phone is the referee. */
export function LiveGame({ game, engine }: { game: SavedGame; engine?: RosterEngine }) {
  const room = useRoom(game);
  const state = game.live?.state;
  const myId = game.live!.myId;
  const unlinked = Boolean(game.live?.unlinked);
  const send = (a: LiveAction) => {
    if (!unlinked) return room?.dispatch(a);
    // Offline copy: you may change everything; applied on the latest saved copy.
    void applyUnlinked(game.id, [a]);
  };
  // One tap can make several changes (score a card and add its VP): they go as one.
  const tap = useRef<LiveAction[]>([]);
  const dispatch = (a: LiveAction) => {
    if (a.t === 'join') return send(a);
    tap.current.push(a);
    if (tap.current.length > 1) return;
    queueMicrotask(() => {
      const list = tap.current;
      tap.current = [];
      send(list.length === 1 ? list[0]! : { t: 'batch', actions: list });
    });
  };

  // Share how many models (and points) each of my units has left, so the other players can see it.
  const mine = useMemo(() => (engine ? toSummaries(unitsLeft(engine, game.casualties, game.wounds)) : undefined), [engine, game.casualties, game.wounds]);
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

/** True once `on` has stayed true for `ms` (a link that drops for a moment and comes back says nothing). */
function useSteady(on: boolean, ms: number): boolean {
  const [steady, setSteady] = useState(false);
  useEffect(() => {
    if (!on) return setSteady(false);
    const timer = setTimeout(() => setSteady(true), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return on && steady;
}

/** How long a guest's link to the host must be down before the screen says so. */
const CUT_OFF_GRACE_MS = 15_000;

function Status({ room }: { room?: Room }) {
  // A guest's link blips (screen locked, app switched, a weak signal): only a lasting drop is shown as one.
  const lost = useSteady(Boolean(room?.cutOff), CUT_OFF_GRACE_MS);
  if (!room) return null;
  const guestBlip = room.role === 'guest' && room.cutOff && !lost;
  const text = guestBlip
    ? 'Live · reconnecting…'
    : room.status === 'online'
      ? // A guest with its link to the host up doesn't need the matchmaking server: no news there.
        (room.role === 'host' ? `Live · hosting · ${room.peers} ${room.peers === 1 ? 'phone' : 'phones'} connected` : 'Live · connected to host') + (room.error && room.role === 'host' ? ` · ${room.error}` : '')
      : room.status === 'connecting'
        ? room.error || 'Connecting…'
        : room.status === 'asleep'
          ? room.error || 'Live · every phone has the result'
          : room.error || 'Offline';
  const color = room.status === 'online' ? 'var(--ok)' : guestBlip || room.status === 'connecting' || room.status === 'asleep' ? 'var(--text-muted)' : 'var(--danger)';
  return (
    <div className="small" style={{ color, marginBottom: 6 }}>
      ● {text}
      {room.role === 'guest' && room.unsent > 0 ? ` · ${room.unsent} ${room.unsent === 1 ? 'change' : 'changes'} not yet with the host` : ''}
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
      {mode.sizes.some((n) => n > 1) && <p className="small muted">Teammates share one CP pool: either of you can spend it, and you both see the same number.</p>}

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
  // The "playing on without the host" note only once the link has been down a while, not on every blip.
  const showCutOff = useSteady(cutOff, CUT_OFF_GRACE_MS);
  const isHost = game.live?.role === 'host' || unlinked;
  const me = state.players.find((p) => p.id === myId)!;
  const myTeam = me.team;
  const teams = teamsOf(state);
  const others = opponentsOf(state, myTeam);
  const [tab, setTab] = useSessionState<'phase' | 'missions' | 'rules' | 'units' | 'score' | 'log'>(`battle-tab:${game.id}`, 'phase');
  const [note, setNote] = useState('');
  const [ending, setEnding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [askHost, setAskHost] = useState(false);
  const [follow, setFollow] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [viewRound, setViewRound] = useViewRound(state.round);
  const at = stampOf(state);
  const previousRoom = liveOf(game)?.previousRoom;
  const waitingFor = state.players.length - 1 - (room?.peers ?? 0);
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
  const myUnits = useMemo(() => (engine ? unitsLeft(engine, game.casualties, game.wounds) : []), [engine, game.casualties, game.wounds]);
  // Each team's health this round: my own units as I see them, everyone else's from what their phones share.
  const health = Object.fromEntries(
    teams.map((t) => [t, healthOf(membersOf(state, t).flatMap((p) => (p.id === myId ? toSummaries(myUnits) : (state.units[p.id] ?? []))))]),
  );
  useHealthRecorder(game.id, state.round, health, 'battle');
  const usedThisPhase = useLiveQuery(() => db.games.get(game.id).then((g) => g?.used ?? []), [game.id]);
  const myScore = totalScore(vpOf(state, myTeam));
  const best = Math.max(...others.map((t) => totalScore(vpOf(state, t))));
  // With a shared pool, one CP counter per team; otherwise one per player.
  // One CP pool per team (teammates share it).
  const cpRows = [myTeam, ...others]
    .filter((t) => membersOf(state, t).length)
    .map((t) => ({ key: t, label: t === myTeam ? (membersOf(state, t).length > 1 ? 'Us' : 'You') : teamNames(state, t), id: membersOf(state, t)[0]!.id, editable: free || t === myTeam }));
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
  const carryOn = async () => {
    const code = await continueAsHost(game.id);
    if (code) showToast(`You're the host now · room ${code}`);
  };
  const followTo = async () => {
    if (await moveToRoom(game.id, newCode)) {
      setFollow(false);
      setNewCode('');
      showToast(`Joining room ${newCode}…`);
    } else showToast('That is not a new 6-letter room code');
  };
  const addCp = (id: string, value: number) => dispatch({ t: 'cpAdd', id, delta: value - (state.cp[id] ?? 0) });

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
          {showCutOff && (
            <div className="offline-note small" role="status">
              <strong>Playing on without the host.</strong> Everything works on this phone, and is kept if the app closes. When the host is back, what you did is sent over and checked like any other change: your CP and score are added to theirs, and the turn only moves on where the host's game was at the same spot. The other team's numbers come from the host.
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn btn-sm" onClick={() => setAskHost(true)}>
                  Host's phone gone? Carry on as host
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setFollow(true)}>
                  New room code
                </button>
              </div>
            </div>
          )}
          {!cutOff && game.live?.role === 'host' && previousRoom && waitingFor > 0 && (
            <div className="offline-note small" role="status">
              <strong>You're the host now · room {state.room}.</strong> On the other phones: Game menu → <em>Follow the game to a new room</em>, and type {state.room}. Their changes made meanwhile are added.
            </div>
          )}
        </>
      )}
      <div className="game-layout">
        <div className="game-controls">
          <RoundBar round={state.round} disabled={!mayAdvance} onPick={(r) => dispatch({ t: 'round', round: r, at })} />
          <TurnBanner
            mine={myTurn}
            label={myTurn ? `Your ${membersOf(state, myTeam).length > 1 ? "team's " : ''}turn` : `${teamNames(state, state.turn)}'s turn`}
            phase={PHASE_NAMES[state.phase]}
            vp={`${myScore}–${best}`}
            onSwitch={mayAdvance && !gameOver ? () => dispatch({ t: 'turn', at }) : undefined}
            switchTo={teamNames(state, order[(order.indexOf(state.turn) + 1) % order.length]!)}
          />
          <PhaseStrip value={viewPhase} current={state.phase} onPick={setViewPhase} label="Look at a phase (only on your screen)" />
          <CpBar sides={cpRows.map((r) => ({ key: r.key, label: r.label, value: state.cp[r.id] ?? 0, onChange: r.editable ? (v: number) => addCp(r.id, v) : undefined }))} />
          
          <NotesPanel gameId={game.id} notes={game.notes} />
        </div>

        <div className="game-main">
          <BattleTabs tab={tab} onTab={setTab} phase={viewPhase} />

          {tab === 'rules' && <RulesPanel engine={engine} />}

          {tab === 'missions' && (
            <>
              <MissionRoundPicker round={state.round} value={viewRound} onChange={setViewRound} />
              <MissionsPanel
                sec={secOf(myTeam)}
                onSec={(op: SecOp, text?: string) => dispatch({ t: 'sec', team: myTeam, op, text })}
                round={state.round}
                viewRound={viewRound}
                turnKey={`${state.round}-${state.turn}`}
                myCommandPhase={myTurn && state.phase === 'command'}
                primary={primaryOfTeam(myTeam)}
                twist={state.twist}
                role={game.role}
                onVp={(kind, vp, _why, round) => {
                  // Sent as a change, so a teammate's VP for the same round is added to, never replaced. Undo sends a negative one.
                  const i = Math.min(round, vpOf(state, myTeam)[kind].length) - 1;
                  dispatch({ t: 'vpAdd', team: myTeam, kind, round: i, delta: vp });
                  if (vp > 0) showToast(`+${vp} VP added to round ${round}`);
                  else if (vp < 0) showToast(`${-vp} VP taken off round ${round}`);
                }}
              />
              {others.map((t) => (
                <div key={t} className="opp-missions">
                  <MissionsPanel readOnly who={`${teamNames(state, t)}'s`} sec={secOf(t)} round={state.round} viewRound={viewRound} turnKey={`${state.round}-${state.turn}`} myCommandPhase={false} primary={primaryOfTeam(t)} />
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
                        onChange={(r, v) => dispatch({ t: 'vpAdd', team, kind, round: r, delta: v - (vpOf(state, team)[kind][r] ?? 0) })}
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
            <button className="btn" onClick={() => dispatch({ t: 'prev', at })} disabled={!mayAdvance} aria-label="Previous phase">
              <Icon name="back" />
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => (gameOver ? isHost && setEnding(true) : dispatch({ t: 'next', at }))} disabled={!mayAdvance || (gameOver && !isHost)}>
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
        {!unlinked && game.live?.role === 'guest' && (
          <button className="menu-item" onClick={() => (setMenu(false), setAskHost(true))}>
            <span>
              Carry on as host
              <div className="muted small">The host's phone is gone for good: this phone opens a new room from its copy of the game, and the others follow it there.</div>
            </span>
          </button>
        )}
        {!unlinked && (
          <button className="menu-item" onClick={() => (setMenu(false), setFollow(true))}>
            <span>
              Follow the game to a new room
              <div className="muted small">Another player carries on as host: type their new room code. Your changes made meanwhile go with you.</div>
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

      <ConfirmSheet
        open={askHost}
        onClose={() => setAskHost(false)}
        title="Carry on as host?"
        message={`Only when ${state.players.find((p) => p.id === state.hostId)?.name ?? 'the host'}'s phone can't come back. This phone opens a new room with its copy of the game; you get a new code for the others to type in Game menu → Follow the game to a new room.`}
        confirm="Carry on as host"
        onConfirm={() => void carryOn()}
      />

      <Sheet open={follow} onClose={() => setFollow(false)} title="Follow the game to a new room">
        <p className="small muted" style={{ marginTop: 0 }}>
          Type the room code the new host's phone shows. {game.live?.role === 'host' ? 'This phone then follows their game; changes made here since the others moved are not sent.' : 'What you did while cut off is sent there.'}
        </p>
        <input
          className="input"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="ABC123"
          autoCapitalize="characters"
          aria-label="New room code"
          style={{ letterSpacing: '0.2em', fontSize: 22 }}
        />
        <div className="btn-row">
          <button className="btn btn-primary btn-block" disabled={!/^[A-Z0-9]{6}$/.test(newCode)} onClick={() => void followTo()}>
            Follow
          </button>
        </div>
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
  const teams = teamsOf(state);
  // The room stays open until every phone has the result (it closes by itself then).
  const count = isHost && room ? room.resultCount : undefined;
  const stuck = room && (room.status === 'offline' || room.status === 'error' || (room.status === 'asleep' && room.error));
  return (
    <Screen title="Result" back="/play">
      <Status room={room} />
      {count && count.of > 1 && (
        <p className="small muted" role="status">
          {count.have}/{count.of} phones have the result{count.have < count.of ? ' — keep the app open for a moment; the others get it when their game is open.' : '.'}
        </p>
      )}
      {stuck && (
        <button className="btn btn-sm" onClick={() => room.wake()}>
          {isHost ? 'Send the result again' : 'Get the result again'}
        </button>
      )}
      <ResultView
        game={game}
        roundsPlayed={state.round}
        sides={teams.map((t) => ({ key: t, name: teamNames(state, t), score: vpOf(state, t), isMe: t === myTeam }))}
        details={[
          MODES[state.mode]?.label ?? state.mode,
          state.players.find((p) => p.team === myTeam)?.primary || state.mission || '',
          state.deployment ?? '',
          new Date(game.startedAt).toLocaleDateString(),
          gameDuration(game) ?? '',
        ]}
        actions={
          <>
            {isHost && (
              <button className="btn" onClick={() => dispatch({ t: 'reopen' })}>
                Reopen for everyone
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => navigate('/play')}>
              Back to games
            </button>
            <button className="btn btn-ghost btn-danger" onClick={() => setAskDelete(true)}>
              Delete game
            </button>
          </>
        }
      />
      <ResultLog entries={state.log} />
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
