/**
 * Shared state of a live game played across several phones: 1v1, 2v2, 2v1
 * or a three-player free-for-all. The host's phone is the referee: everyone
 * sends actions, the host runs them through `reduce` and sends the new state
 * back to all players. Pure and serialisable, so it can be tested and stored as-is.
 */
import { emptyScore, PHASES, ROUNDS, type Phase, type Score } from './game';
import { applySecOp, emptySecondaries, primaryFor, type SecOp, type SecondaryState } from './missions';

export type Team = 'A' | 'B' | 'C';
export type LiveMode = '1v1' | '2v2' | '2v1' | 'ffa';
export const TEAMS: Team[] = ['A', 'B', 'C'];

/** Players per team for each mode (2v1 takes either team as the pair). */
export const MODES: Record<LiveMode, { label: string; teams: Team[]; sizes: number[]; players: number }> = {
  '1v1': { label: '1v1', teams: ['A', 'B'], sizes: [1, 1], players: 2 },
  '2v2': { label: '2v2', teams: ['A', 'B'], sizes: [2, 2], players: 4 },
  '2v1': { label: '2v1', teams: ['A', 'B'], sizes: [2, 1], players: 3 },
  ffa: { label: '3 players', teams: ['A', 'B', 'C'], sizes: [1, 1, 1], players: 3 },
};

export interface LivePlayer {
  id: string;
  name: string;
  team: Team;
  army: string;
  faction: string;
  detachments: string[];
  disposition?: string;
  /** Force Dispositions this player's list allows (all when empty). */
  allowed?: string[];
  /** This player's primary mission: from their disposition against the opponents', or picked by hand. */
  primary?: string;
  /** The primary was picked by hand (not worked out from the dispositions). */
  manualPrimary?: boolean;
  /** Their list as ids and counts, so other players can look at their units (read-only). */
  list?: import('./share').SharePayload;
}

export interface UnitSummary {
  name: string;
  alive: number;
  total: number;
  points?: number;
  /** Wounds left and at the start, so other phones can follow how the battle goes. */
  w?: number;
  wt?: number;
}

export interface LiveLog {
  at: number;
  round: number;
  turn: Team;
  phase: Phase;
  text: string;
  by?: string;
}

export interface LiveState {
  room: string;
  /** Goes up by one with every change. */
  v: number;
  stage: 'lobby' | 'battle' | 'done';
  mode: LiveMode;
  hostId: string;
  players: LivePlayer[];
  mission?: string;
  deployment?: string;
  twist?: string;
  firstTurn: Team;
  /** Which team is the Attacker (from the deployment roll-off); the other team defends. */
  attacker?: Team;
  round: number;
  turn: Team;
  phase: Phase;
  /** CP per player id. Teammates share one pool: they always hold the same number. */
  cp: Record<string, number>;
  /** Older games: whether teammates shared CP. Teams now always share one pool. */
  sharedCp?: boolean;
  vp: Partial<Record<Team, Score>> & Record<'A' | 'B', Score>;
  /** Each team's secondaries and primary-scored rounds, readable by everyone. */
  missions?: Partial<Record<Team, SecondaryState>>;
  units: Record<string, UnitSummary[]>;
  log: LiveLog[];
  winner?: Team | 'draw';
  /**
   * The host's count of each player's numbered actions it has handled (see
   * `Pending`). A phone resends what isn't counted yet; nothing counted is
   * ever applied twice.
   */
  acks?: Record<string, number>;
  /** The furthest turn (see `turnKey`) whose Command-phase CP has been given, so going back and forth never gives it twice. */
  cpAt?: number;
}

/** Where the game was when a player tapped: turn moves made from an older spot are ignored. */
export interface Stamp {
  round: number;
  turn: Team;
  phase: Phase;
}
export const stampOf = (s: Pick<LiveState, 'round' | 'turn' | 'phase'>): Stamp => ({ round: s.round, turn: s.turn, phase: s.phase });

/** One action a guest took, numbered per player, kept until the host has handled it. */
export interface Pending {
  seq: number;
  action: LiveAction;
  at: number;
}

export type LiveAction =
  | { t: 'join'; player: LivePlayer }
  | { t: 'leave'; id: string }
  | { t: 'setTeam'; id: string; team: Team }
  | { t: 'setMode'; mode: LiveMode }
  | { t: 'setSharedCp'; on: boolean }
  | { t: 'setMission'; mission?: string; deployment?: string; twist?: string }
  /** Set your Force Disposition (for your whole team) and/or pick your primary by hand (`manual`). */
  | { t: 'setPrimary'; mission?: string; disposition?: string; manual?: boolean }
  | { t: 'setFirst'; team: Team }
  | { t: 'setAttacker'; team: Team }
  | { t: 'start' }
  /** Turn moves carry `at`, where the game was when the player tapped; a stale one (a double tap, a phone that was cut off) is ignored. */
  | { t: 'next'; at?: Stamp }
  | { t: 'prev'; at?: Stamp }
  | { t: 'phase'; phase: Phase; at?: Stamp }
  | { t: 'round'; round: number; at?: Stamp }
  /** Hand the turn to the next team (tapping the turn banner). */
  | { t: 'turn'; at?: Stamp }
  /** Older phones set CP / VP to a number. Newer phones send changes (`cpAdd`, `vpAdd`), so two phones changing it never undo each other. */
  | { t: 'cp'; id: string; value: number }
  | { t: 'vp'; team: Team; kind: 'primary' | 'secondary'; round: number; value: number }
  | { t: 'cpAdd'; id: string; delta: number }
  | { t: 'vpAdd'; team: Team; kind: 'primary' | 'secondary'; round: number; delta: number }
  | { t: 'strat'; name: string; cost: number }
  | { t: 'sec'; team: Team; op: SecOp; text?: string }
  | { t: 'units'; units: UnitSummary[] }
  | { t: 'note'; text: string }
  | { t: 'end' }
  | { t: 'reopen' }
  /** Several actions from one tap (e.g. score a card and add its VP): none of them count when the card is no longer there. */
  | { t: 'batch'; actions: LiveAction[] };

/** Teams in play for this game's mode. */
export const teamsOf = (s: Pick<LiveState, 'mode'>): Team[] => MODES[s.mode]?.teams ?? ['A', 'B'];

/** The other team in a two-team game; in a free-for-all, the next team in turn order. */
export const otherTeam = (t: Team, s?: Pick<LiveState, 'mode' | 'firstTurn'>): Team => {
  const teams = s ? teamsOf(s) : (['A', 'B'] as Team[]);
  if (teams.length === 2 && teams.includes(t)) return t === teams[0] ? teams[1]! : teams[0]!;
  return teams[(teams.indexOf(t) + 1) % teams.length] ?? 'B';
};

/** Every team except this one. */
export const opponentsOf = (s: Pick<LiveState, 'mode'>, t: Team): Team[] => teamsOf(s).filter((x) => x !== t);

/** Turn order within a battle round: the team that goes first, then the others in order. */
export function turnOrder(s: Pick<LiveState, 'mode' | 'firstTurn'>): Team[] {
  const teams = teamsOf(s);
  const i = Math.max(0, teams.indexOf(s.firstTurn));
  return [...teams.slice(i), ...teams.slice(0, i)];
}

/** Orders the turns of a game: round, then place in the turn order. */
export const turnKey = (s: Pick<LiveState, 'mode' | 'firstTurn'>, round: number, team: Team) => round * 10 + Math.max(0, turnOrder(s).indexOf(team));

export const vpOf = (s: Pick<LiveState, 'vp'>, t: Team): Score => s.vp[t] ?? emptyScore();
export const missionsOf = (s: Pick<LiveState, 'missions'>, t: Team): SecondaryState => s.missions?.[t] ?? emptySecondaries();

/** Are the teams filled the way the mode needs? */
export function teamsReady(s: Pick<LiveState, 'mode' | 'players'>): boolean {
  const m = MODES[s.mode];
  const counts = m.teams.map((t) => s.players.filter((p) => p.team === t).length);
  if (s.players.some((p) => !m.teams.includes(p.team))) return false;
  return [...counts].sort().join() === [...m.sizes].sort().join();
}

export function newLiveState(room: string, host: LivePlayer): LiveState {
  return {
    room,
    v: 1,
    stage: 'lobby',
    mode: '1v1',
    hostId: host.id,
    players: [{ ...host, team: 'A' }],
    firstTurn: 'A',
    round: 1,
    turn: 'A',
    phase: 'command',
    cp: { [host.id]: 0 },
    sharedCp: true,
    vp: { A: emptyScore(), B: emptyScore() },
    units: {},
    log: [],
  };
}

/** The team with the most room gets the newcomer (1v1: the second player is team B). */
function pickTeam(s: LiveState): Team {
  const m = MODES[s.mode];
  let best: Team = m.teams[0]!;
  let room = -Infinity;
  m.teams.forEach((t, i) => {
    const left = (m.sizes[i] ?? 1) - s.players.filter((p) => p.team === t).length;
    if (left > room) {
      room = left;
      best = t;
    }
  });
  return best;
}

/** A mode that fits this many players (keeps the current one when it still fits). */
function modeFor(current: LiveMode, players: number): LiveMode {
  if (MODES[current].players >= players) return current;
  return players <= 2 ? '1v1' : players === 3 ? '2v1' : '2v2';
}

export const teamNames = (s: Pick<LiveState, 'players'>, team: Team) =>
  s.players
    .filter((p) => p.team === team)
    .map((p) => p.name)
    .join(' & ') || `Team ${team}`;

/**
 * Acting as LOCAL may change anything, as nobody in particular. Prefer
 * `reduce(s, a, myId, { local: true })`: that also allows everything but
 * still knows who acted (so a stratagem takes your own CP).
 */
export const LOCAL = '__local__';

export interface ReduceOpts {
  /** An unlinked copy, or a guest playing on while cut off from the host: anything may be changed. */
  local?: boolean;
}

/** May `from` advance the turn? The team whose turn it is, or the host. */
export const canAdvance = (s: LiveState, from: string, opts?: ReduceOpts) =>
  Boolean(opts?.local) || from === LOCAL || from === s.hostId || s.players.find((p) => p.id === from)?.team === s.turn;

/** Was a turn move made from somewhere else than where the game is now? */
const staleAt = (s: LiveState, at?: Stamp) => Boolean(at) && (at!.round !== s.round || at!.turn !== s.turn || at!.phase !== s.phase);

/** Work out each player's primary from the dispositions, unless they picked one by hand. */
function withPrimaries(s: LiveState): LiveState {
  const players = s.players.map((p) => {
    if (p.manualPrimary) return p;
    const theirs = [...new Set(s.players.filter((o) => o.team !== p.team && o.disposition).map((o) => o.disposition!))];
    // Against one disposition the card says which primary; in a free-for-all against two, pick by hand.
    return { ...p, primary: theirs.length === 1 ? primaryFor(p.disposition, theirs[0]) : undefined };
  });
  return { ...s, players };
}

/** Set a player's CP; with a shared pool their teammates get the same number. */
function setCp(s: LiveState, id: string, value: number): LiveState {
  const team = s.players.find((p) => p.id === id)?.team;
  const v = Math.max(0, value);
  const cp = { ...s.cp, [id]: v };
  if (team) for (const p of s.players) if (p.team === team) cp[p.id] = v;
  return { ...s, cp };
}

export function reduce(s: LiveState, a: LiveAction, from: string, opts?: ReduceOpts): LiveState {
  const local = from === LOCAL || Boolean(opts?.local);
  const by = s.players.find((p) => p.id === from)?.name;
  const isHost = local || from === s.hostId;
  const myTeam = s.players.find((p) => p.id === from)?.team;
  const log = (st: LiveState, text: string): LiveState => ({ ...st, log: [...st.log, { at: Date.now(), round: st.round, turn: st.turn, phase: st.phase, text, by }] });
  const bump = (st: LiveState): LiveState => ({ ...st, v: s.v + 1 });
  const mayMove = (at?: Stamp) => s.stage === 'battle' && canAdvance(s, from, opts) && !staleAt(s, at);
  /** Start a team's turn at its Command phase; everyone gains 1 CP the first time that turn starts. */
  /** Command-phase CP has been given up to here (older games don't say: up to the turn they are in). */
  const given = s.cpAt ?? turnKey(s, s.round, s.turn);
  const startTurn = (round: number, turn: Team): LiveState => {
    const key = turnKey(s, round, turn);
    let next: LiveState = { ...s, round, turn, phase: 'command' };
    const text = `Round ${round}, ${teamNames(s, turn)}: Command phase`;
    if (key <= given) return bump(log(next, text));
    // Every player gains 1 CP at the start of every Command phase (a shared pool gains 1 for the team).
    next = { ...next, cpAt: key, cp: Object.fromEntries(Object.entries(s.cp).map(([k, v]) => [k, v + 1])) };
    return bump(log(next, `${text} · everyone gains 1 CP`));
  };
  /** The end of a team's turn: the next team's turn, or the next round after the last team. */
  const handOver = (): LiveState => {
    const order = turnOrder(s);
    const k = order.indexOf(s.turn);
    if (k >= 0 && k < order.length - 1) return startTurn(s.round, order[k + 1]!);
    if (s.round >= ROUNDS) return s;
    return startTurn(s.round + 1, order[0]!);
  };

  switch (a.t) {
    case 'join': {
      const existing = s.players.find((p) => p.id === a.player.id);
      if (existing)
        return bump(
          withPrimaries({
            ...s,
            players: s.players.map((p) =>
              p.id === a.player.id ? { ...a.player, team: p.team, primary: p.primary, manualPrimary: p.manualPrimary, disposition: p.disposition ?? a.player.disposition, list: a.player.list ?? p.list } : p,
            ),
          }),
        );
      if (s.stage !== 'lobby') return s; // no new players mid-game; rejoining is handled above
      if (s.players.length >= 4) return s;
      // More players than the mode holds: 3 makes it a 2v1, 4 a 2v2.
      const mode = modeFor(s.mode, s.players.length + 1);
      const base = mode !== s.mode ? log({ ...s, mode }, `${s.players.length + 1} players: switched to ${MODES[mode].label}`) : s;
      const player = { ...a.player, team: pickTeam(base) };
      const cp = { ...base.cp, [player.id]: 0 };
      return bump(withPrimaries(log({ ...base, players: [...base.players, player], cp }, `${player.name} joined`)));
    }
    case 'leave':
      if (!isHost && from !== a.id) return s;
      if (s.stage !== 'lobby') return s;
      return bump(withPrimaries({ ...s, players: s.players.filter((p) => p.id !== a.id) }));
    case 'setTeam':
      if (!isHost && from !== a.id) return s;
      if (!teamsOf(s).includes(a.team)) return s;
      return bump(withPrimaries({ ...s, players: s.players.map((p) => (p.id === a.id ? { ...p, team: a.team } : p)) }));
    case 'setMode': {
      if (!isHost || s.stage !== 'lobby') return s;
      const teams = MODES[a.mode].teams;
      // Players on a team the new mode doesn't have move to the team with most room.
      let next: LiveState = { ...s, mode: a.mode, firstTurn: teams.includes(s.firstTurn) ? s.firstTurn : 'A', turn: teams.includes(s.turn) ? s.turn : 'A' };
      for (const p of next.players.filter((x) => !teams.includes(x.team))) {
        const others = { ...next, players: next.players.filter((x) => x.id !== p.id) };
        next = { ...next, players: next.players.map((x) => (x.id === p.id ? { ...x, team: pickTeam(others) } : x)) };
      }
      return bump(withPrimaries(next));
    }
    case 'setSharedCp':
      // Teams always share one CP pool now; kept so older phones' messages are understood.
      return s;
    case 'setMission':
      if (!isHost) return s;
      return bump({ ...s, mission: a.mission ?? s.mission, deployment: a.deployment ?? s.deployment, twist: a.twist ?? s.twist });
    case 'setAttacker':
      if (!s.players.some((p) => p.id === from) && !local) return s;
      return bump(log({ ...s, attacker: a.team }, `${teamNames(s, a.team)} ${s.players.filter((p) => p.team === a.team).length > 1 ? 'are' : 'is'} the Attacker`));
    case 'setPrimary': {
      const me = s.players.find((p) => p.id === from);
      if (!me) return s;
      // A team plays one Force Disposition and one primary: a choice sets it for your teammates too.
      const players = s.players.map((p) => {
        if (p.team !== me.team) return p;
        let q = p;
        if (a.disposition !== undefined) q = { ...q, disposition: a.disposition || undefined };
        if (a.manual !== undefined) q = { ...q, manualPrimary: a.manual && Boolean(a.mission), primary: a.manual ? a.mission || undefined : q.primary };
        return q;
      });
      return bump(withPrimaries({ ...s, players }));
    }
    case 'setFirst':
      if (!isHost || !teamsOf(s).includes(a.team)) return s;
      return bump({ ...s, firstTurn: a.team, turn: s.stage === 'lobby' ? a.team : s.turn });
    case 'start': {
      if (!isHost || s.stage !== 'lobby') return s;
      const cp = Object.fromEntries(s.players.map((p) => [p.id, 1]));
      const vp = Object.fromEntries(teamsOf(s).map((t) => [t, emptyScore()])) as LiveState['vp'];
      const first = turnOrder(s)[0]!;
      return bump(log({ ...s, stage: 'battle', round: 1, turn: first, phase: 'command', cp, vp, cpAt: turnKey(s, 1, first) }, 'Battle started · everyone gains 1 CP'));
    }
    case 'next': {
      if (!mayMove(a.at)) return s;
      const i = PHASES.indexOf(s.phase);
      if (i < PHASES.length - 1) return bump({ ...s, phase: PHASES[i + 1]! });
      return handOver();
    }
    case 'prev': {
      // Going back never takes the Command-phase CP away, and moving on again doesn't give it twice (see `cpAt`).
      if (!mayMove(a.at)) return s;
      const i = PHASES.indexOf(s.phase);
      if (i > 0) return bump({ ...s, phase: PHASES[i - 1]! });
      const order = turnOrder(s);
      const k = order.indexOf(s.turn);
      if (k > 0) return bump({ ...s, turn: order[k - 1]!, phase: 'fight', cpAt: given });
      if (s.round > 1) return bump({ ...s, round: s.round - 1, turn: order[order.length - 1]!, phase: 'fight', cpAt: given });
      return s;
    }
    case 'phase':
      if (!mayMove(a.at)) return s;
      return bump({ ...s, phase: a.phase });
    case 'round':
      // Jump to the start of a battle round (first player's Command phase).
      if (!mayMove(a.at) || a.round < 1 || a.round > ROUNDS || a.round === s.round) return s;
      return bump(log({ ...s, round: a.round, turn: turnOrder(s)[0]!, phase: 'command', cpAt: given }, `Moved to round ${a.round}`));
    case 'turn':
      // Like Next at the end of the turn: the next team's Command phase (with its CP), the next round after the last team.
      if (!mayMove(a.at)) return s;
      return handOver();
    case 'cp':
    case 'cpAdd': {
      // Each player changes only their own CP (with a shared pool: their team's).
      const target = s.players.find((p) => p.id === a.id);
      if (!local && from !== a.id && !(target && target.team === myTeam)) return s;
      if (!(a.id in s.cp) && !target) return s;
      return bump(setCp(s, a.id, a.t === 'cp' ? a.value : (s.cp[a.id] ?? 0) + a.delta));
    }
    case 'vp':
    case 'vpAdd': {
      // Each team scores itself.
      if (!local && myTeam !== a.team) return s;
      const cur = vpOf(s, a.team);
      if (a.round < 0 || a.round >= cur[a.kind].length) return s;
      const value = (x: number) => Math.max(0, a.t === 'vp' ? a.value : x + a.delta);
      const score = { ...cur, [a.kind]: cur[a.kind].map((x, i) => (i === a.round ? value(x) : x)) };
      return bump({ ...s, vp: { ...s.vp, [a.team]: score } });
    }
    case 'strat': {
      // Paid from the player's own (team's) pool, never from a made-up player.
      if (!s.players.some((p) => p.id === from)) return s;
      const next = setCp(s, from, (s.cp[from] ?? 0) - a.cost);
      return bump(log(next, `${by ?? 'Someone'} used ${a.name} (${a.cost} CP)`));
    }
    case 'sec': {
      // A team manages its own missions; everyone else can read them.
      if (!local && myTeam !== a.team) return s;
      const before = missionsOf(s, a.team);
      const after = applySecOp(before, a.op);
      if (after === before) return s;
      const next = { ...s, missions: { ...s.missions, [a.team]: after } };
      return bump(a.text ? log(next, a.text) : next);
    }
    case 'units':
      return bump({ ...s, units: { ...s.units, [from]: a.units } });
    case 'note':
      return a.text.trim() ? bump(log(s, a.text.trim())) : s;
    case 'end': {
      if (!isHost || s.stage !== 'battle') return s;
      const totals = teamsOf(s).map((t) => ({ t, vp: totalOf(s, t) })).sort((x, y) => y.vp - x.vp);
      const winner: LiveState['winner'] = totals.length > 1 && totals[0]!.vp === totals[1]!.vp ? 'draw' : totals[0]!.t;
      return bump(log({ ...s, stage: 'done', winner }, `Game over: ${totals.map((x) => `${teamNames(s, x.t)} ${x.vp}`).join(' · ')}`));
    }
    case 'reopen':
      if (!isHost || s.stage !== 'done') return s;
      return bump({ ...s, stage: 'battle', winner: undefined });
    case 'batch': {
      let st = s;
      for (const x of a.actions) {
        if (x.t === 'batch') return s;
        const n = reduce(st, x, from, opts);
        // A card that is gone (scored or swapped on another phone): the whole tap is dropped, so its CP or VP isn't counted either.
        if (n === st && x.t === 'sec') return s;
        st = n;
      }
      return st === s ? s : bump(st);
    }
    default:
      return s;
  }
}

/**
 * The host handles a numbered action from a player: once only (a resent copy
 * is skipped), through the same rules as everything else, and counts it in
 * `acks` even when the rules turned it down, so the phone stops resending it.
 * Actions without a number come from older phones and are simply applied.
 */
export function receive(s: LiveState, a: LiveAction, from: string, seq?: number): LiveState {
  if (seq === undefined) return reduce(s, a, from);
  if (seq <= (s.acks?.[from] ?? 0)) return s;
  const next = reduce(s, a, from);
  return { ...next, v: s.v + 1, acks: { ...s.acks, [from]: seq } };
}

/** The highest action number of this player's that the host has handled. */
export const ackOf = (s: Pick<LiveState, 'acks'> | undefined, id: string) => s?.acks?.[id] ?? 0;

/**
 * What a guest shows: the host's last copy plus its own actions the host
 * hasn't handled yet. While cut off from the host anything may be changed
 * (`local`); the host still checks every action when they arrive.
 */
export function withPending(base: LiveState, pending: Pending[], me: string, local = false): LiveState {
  const done = ackOf(base, me);
  return pending.filter((p) => p.seq > done).reduce((st, p) => reduce(st, p.action, me, { local }), base);
}

/**
 * Another player carries on as host (the host's phone is gone): the latest
 * copy this phone has, with its own unhandled actions applied, under a new
 * room code. The others join the new room and resend what this copy hasn't
 * counted from them yet.
 */
export function takeOver(base: LiveState, pending: Pending[], me: string, room: string): LiveState {
  const name = base.players.find((p) => p.id === me)?.name ?? 'A player';
  let s: LiveState = { ...base, room, hostId: me };
  for (const p of pending) s = receive(s, p.action, me, p.seq);
  return { ...s, v: s.v + 1, log: [...s.log, { at: Date.now(), round: s.round, turn: s.turn, phase: s.phase, text: `${name} carries on as host · new room ${room}`, by: name }] };
}

/** How far into the game a state is: round, then whose turn in the order, then phase. */
function progress(s: LiveState): number {
  const order = turnOrder(s);
  return s.round * 100 + Math.max(0, order.indexOf(s.turn)) * 10 + PHASES.indexOf(s.phase);
}

/**
 * Older phones only: a phone cut off from the host kept playing on its own
 * copy and sends the whole copy when it reconnects (newer phones send their
 * actions instead, see `receive`). The host folds in that player's team's
 * own things: CP, score, missions, disposition and primary, the player's
 * units left, and log lines written offline. Nothing that belongs to another
 * team or player is ever taken from the phone, and the turn stays where the
 * host has it (moving it from the phone's copy would skip the other teams'
 * Command-phase CP).
 */
export function mergeOffline(host: LiveState, phone: LiveState, base: LiveState | undefined, from: string): LiveState {
  const me = host.players.find((p) => p.id === from);
  if (!me || phone.room !== host.room) return host;
  const team = me.team;
  // Only what the phone changed while it was cut off (compared with the last copy the host sent it):
  // a teammate's changes on the host in the meantime are kept.
  const changed = (pick: (s: LiveState) => unknown) => JSON.stringify(pick(phone)) !== JSON.stringify(base ? pick(base) : undefined);
  const mates = host.players.filter((p) => p.team === team).map((p) => p.id);
  const cp = { ...host.cp };
  for (const id of mates) if (id in phone.cp && changed((s) => s.cp[id])) cp[id] = phone.cp[id]!;
  const phoneMe = phone.players.find((p) => p.id === from);
  const teamChoice = (s: LiveState) => {
    const p = s.players.find((x) => x.id === from);
    return [p?.disposition, p?.manualPrimary ? p.primary : undefined];
  };
  const players =
    phoneMe && changed(teamChoice)
      ? withPrimaries({ ...host, players: host.players.map((p) => (p.team === team ? { ...p, disposition: phoneMe.disposition, manualPrimary: phoneMe.manualPrimary, primary: phoneMe.manualPrimary ? phoneMe.primary : p.primary } : p)) }).players
      : host.players;
  const seen = new Set(host.log.map((l) => `${l.at}|${l.text}`));
  const extra = phone.log.filter((l) => !seen.has(`${l.at}|${l.text}`));
  const ahead = host.stage === 'battle' && phone.stage === 'battle' && progress(phone) > progress(host);
  let next: LiveState = {
    ...host,
    players,
    cp,
    vp: phone.vp[team] && changed((s) => s.vp[team]) ? { ...host.vp, [team]: phone.vp[team] } : host.vp,
    missions: phone.missions?.[team] && changed((s) => s.missions?.[team]) ? { ...host.missions, [team]: phone.missions[team] } : host.missions,
    units: phone.units[from] ? { ...host.units, [from]: phone.units[from]! } : host.units,
    log: extra.length ? [...host.log, ...extra].sort((a, b) => a.at - b.at) : host.log,
  };
  if (extra.length || ahead) next = { ...next, log: [...next.log, { at: Date.now(), round: next.round, turn: next.turn, phase: next.phase, text: `${me.name} reconnected — their offline changes were added`, by: me.name }] };
  return { ...next, v: host.v + 1 };
}

const totalOf = (s: LiveState, t: Team) => {
  const sc = vpOf(s, t);
  return sc.primary.reduce((a, b) => a + b, 0) + sc.secondary.reduce((a, b) => a + b, 0);
};

/** Room codes avoid look-alike characters so they're easy to read out loud. */
export function makeRoomCode(rand: () => number = Math.random): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(rand() * chars.length)]).join('');
}
