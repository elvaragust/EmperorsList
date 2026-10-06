/**
 * Shared state of a live game played across several phones (1v1 or 2v2).
 * The host's phone is the referee: everyone sends actions, the host runs
 * them through `reduce` and sends the new state back to all players.
 * Pure and serialisable, so it can be tested and stored as-is.
 */
import { emptyScore, nextPhase, previousPhase, totalScore, type Phase, type Score } from './game';

export type Team = 'A' | 'B';
export type LiveMode = '1v1' | '2v2';

export interface LivePlayer {
  id: string;
  name: string;
  team: Team;
  army: string;
  faction: string;
  detachments: string[];
  disposition?: string;
}

export interface UnitSummary {
  name: string;
  alive: number;
  total: number;
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
  /** Goes up by one with every change, so stale copies are ignored. */
  v: number;
  stage: 'lobby' | 'battle' | 'done';
  mode: LiveMode;
  hostId: string;
  players: LivePlayer[];
  mission?: string;
  deployment?: string;
  twist?: string;
  firstTurn: Team;
  round: number;
  turn: Team;
  phase: Phase;
  /** CP per player id. */
  cp: Record<string, number>;
  vp: Record<Team, Score>;
  units: Record<string, UnitSummary[]>;
  log: LiveLog[];
  winner?: Team | 'draw';
}

export type LiveAction =
  | { t: 'join'; player: LivePlayer }
  | { t: 'leave'; id: string }
  | { t: 'setTeam'; id: string; team: Team }
  | { t: 'setMode'; mode: LiveMode }
  | { t: 'setMission'; mission?: string; deployment?: string; twist?: string }
  | { t: 'setFirst'; team: Team }
  | { t: 'start' }
  | { t: 'next' }
  | { t: 'prev' }
  | { t: 'phase'; phase: Phase }
  | { t: 'cp'; id: string; value: number }
  | { t: 'vp'; team: Team; kind: 'primary' | 'secondary'; round: number; value: number }
  | { t: 'strat'; name: string; cost: number }
  | { t: 'units'; units: UnitSummary[] }
  | { t: 'note'; text: string }
  | { t: 'end' }
  | { t: 'reopen' };

export const otherTeam = (t: Team): Team => (t === 'A' ? 'B' : 'A');
const toSide = (t: Team, first: Team) => (t === first ? 'me' : 'them');
const toTeam = (s: 'me' | 'them', first: Team): Team => (s === 'me' ? first : otherTeam(first));

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
    vp: { A: emptyScore(), B: emptyScore() },
    units: {},
    log: [],
  };
}

/** The team with fewer players gets the newcomer (1v1: the second player is team B). */
function pickTeam(s: LiveState): Team {
  const a = s.players.filter((p) => p.team === 'A').length;
  const b = s.players.filter((p) => p.team === 'B').length;
  return b < a ? 'B' : 'A';
}

export const teamNames = (s: LiveState, team: Team) =>
  s.players
    .filter((p) => p.team === team)
    .map((p) => p.name)
    .join(' & ') || (team === 'A' ? 'Team A' : 'Team B');

/** Acting as LOCAL (an unlinked copy of the game) may change anything. */
export const LOCAL = '__local__';

/** May `from` advance the turn? The team whose turn it is, or the host. */
export const canAdvance = (s: LiveState, from: string) => from === LOCAL || from === s.hostId || s.players.find((p) => p.id === from)?.team === s.turn;

export function reduce(s: LiveState, a: LiveAction, from: string): LiveState {
  const local = from === LOCAL;
  const by = local ? undefined : s.players.find((p) => p.id === from)?.name;
  const isHost = local || from === s.hostId;
  const myTeam = s.players.find((p) => p.id === from)?.team;
  const log = (st: LiveState, text: string): LiveState => ({ ...st, log: [...st.log, { at: Date.now(), round: st.round, turn: st.turn, phase: st.phase, text, by }] });
  const bump = (st: LiveState): LiveState => ({ ...st, v: s.v + 1 });

  switch (a.t) {
    case 'join': {
      const existing = s.players.find((p) => p.id === a.player.id);
      if (existing) return bump({ ...s, players: s.players.map((p) => (p.id === a.player.id ? { ...a.player, team: p.team } : p)) });
      if (s.stage !== 'lobby') return s; // no new players mid-game; rejoining is handled above
      const max = s.mode === '2v2' ? 4 : 2;
      if (s.players.length >= max) return s;
      const player = { ...a.player, team: pickTeam(s) };
      return bump(log({ ...s, players: [...s.players, player], cp: { ...s.cp, [player.id]: 0 } }, `${player.name} joined`));
    }
    case 'leave':
      if (!isHost && from !== a.id) return s;
      if (s.stage !== 'lobby') return s;
      return bump({ ...s, players: s.players.filter((p) => p.id !== a.id) });
    case 'setTeam':
      if (!isHost && from !== a.id) return s;
      return bump({ ...s, players: s.players.map((p) => (p.id === a.id ? { ...p, team: a.team } : p)) });
    case 'setMode':
      if (!isHost || s.stage !== 'lobby') return s;
      return bump({ ...s, mode: a.mode });
    case 'setMission':
      if (!isHost) return s;
      return bump({ ...s, mission: a.mission ?? s.mission, deployment: a.deployment ?? s.deployment, twist: a.twist ?? s.twist });
    case 'setFirst':
      if (!isHost) return s;
      return bump({ ...s, firstTurn: a.team, turn: s.stage === 'lobby' ? a.team : s.turn });
    case 'start': {
      if (!isHost || s.stage !== 'lobby') return s;
      const cp = Object.fromEntries(s.players.map((p) => [p.id, 1]));
      return bump(log({ ...s, stage: 'battle', round: 1, turn: s.firstTurn, phase: 'command', cp }, 'Battle started · everyone gains 1 CP'));
    }
    case 'next': {
      if (s.stage !== 'battle' || !canAdvance(s, from)) return s;
      const n = nextPhase({ round: s.round, turn: toSide(s.turn, s.firstTurn), phase: s.phase }, 'me');
      if (n.gameOver) return s;
      let next: LiveState = { ...s, round: n.round, turn: toTeam(n.turn, s.firstTurn), phase: n.phase };
      if (n.cpGain) {
        next = { ...next, cp: Object.fromEntries(Object.entries(s.cp).map(([k, v]) => [k, v + 1])) };
        next = log(next, `Round ${next.round}, ${teamNames(s, next.turn)}: Command phase · everyone gains 1 CP`);
      }
      return bump(next);
    }
    case 'prev': {
      if (s.stage !== 'battle' || !canAdvance(s, from)) return s;
      const p = previousPhase({ round: s.round, turn: toSide(s.turn, s.firstTurn), phase: s.phase }, 'me');
      return bump({ ...s, round: p.round, turn: toTeam(p.turn, s.firstTurn), phase: p.phase });
    }
    case 'phase':
      if (!canAdvance(s, from)) return s;
      return bump({ ...s, phase: a.phase });
    case 'cp':
      // Each player changes only their own CP.
      if (!local && from !== a.id) return s;
      if (!(a.id in s.cp) && !s.players.some((p) => p.id === a.id)) return s;
      return bump({ ...s, cp: { ...s.cp, [a.id]: Math.max(0, a.value) } });
    case 'vp': {
      // Each team scores itself.
      if (!local && myTeam !== a.team) return s;
      if (a.round < 0 || a.round >= s.vp[a.team][a.kind].length) return s;
      const score = { ...s.vp[a.team], [a.kind]: s.vp[a.team][a.kind].map((x, i) => (i === a.round ? Math.max(0, a.value) : x)) };
      return bump({ ...s, vp: { ...s.vp, [a.team]: score } });
    }
    case 'strat': {
      const cp = Math.max(0, (s.cp[from] ?? 0) - a.cost);
      return bump(log({ ...s, cp: { ...s.cp, [from]: cp } }, `${by ?? 'Someone'} used ${a.name} (${a.cost} CP)`));
    }
    case 'units':
      return bump({ ...s, units: { ...s.units, [from]: a.units } });
    case 'note':
      return a.text.trim() ? bump(log(s, a.text.trim())) : s;
    case 'end': {
      if (!isHost || s.stage !== 'battle') return s;
      const ta = totalScore(s.vp.A);
      const tb = totalScore(s.vp.B);
      const winner: LiveState['winner'] = ta > tb ? 'A' : tb > ta ? 'B' : 'draw';
      return bump(log({ ...s, stage: 'done', winner }, `Game over: ${ta}–${tb}`));
    }
    case 'reopen':
      if (!isHost || s.stage !== 'done') return s;
      return bump({ ...s, stage: 'battle', winner: undefined });
    default:
      return s;
  }
}

/** Room codes avoid look-alike characters so they're easy to read out loud. */
export function makeRoomCode(rand: () => number = Math.random): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(rand() * chars.length)]).join('');
}
