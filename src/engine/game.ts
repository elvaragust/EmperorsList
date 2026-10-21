/** Turn structure and scoring helpers for the War Journal. Pure functions. */

export type Phase = 'command' | 'movement' | 'shooting' | 'charge' | 'fight';
export type Side = 'me' | 'them';
export const PHASES: Phase[] = ['command', 'movement', 'shooting', 'charge', 'fight'];
export const PHASE_NAMES: Record<Phase, string> = { command: 'Command', movement: 'Movement', shooting: 'Shooting', charge: 'Charge', fight: 'Fight' };
export const ROUNDS = 5;

export interface TurnState {
  round: number;
  turn: Side;
  phase: Phase;
}

/**
 * Advance one phase. After Fight the other player's turn starts; after both
 * players have had a turn the round goes up. `cpGain` is true when a Command
 * phase starts (each player gains 1 CP at the start of every Command phase).
 */
export function nextPhase(s: TurnState, firstTurn: Side): TurnState & { cpGain: boolean; gameOver: boolean } {
  const i = PHASES.indexOf(s.phase);
  if (i < PHASES.length - 1) return { ...s, phase: PHASES[i + 1]!, cpGain: PHASES[i + 1] === 'command', gameOver: false };
  const second: Side = firstTurn === 'me' ? 'them' : 'me';
  if (s.turn === firstTurn) return { round: s.round, turn: second, phase: 'command', cpGain: true, gameOver: false };
  if (s.round >= ROUNDS) return { ...s, cpGain: false, gameOver: true };
  return { round: s.round + 1, turn: firstTurn, phase: 'command', cpGain: true, gameOver: false };
}

export function previousPhase(s: TurnState, firstTurn: Side): TurnState {
  const i = PHASES.indexOf(s.phase);
  if (i > 0) return { ...s, phase: PHASES[i - 1]! };
  const second: Side = firstTurn === 'me' ? 'them' : 'me';
  if (s.turn === second) return { round: s.round, turn: firstTurn, phase: 'fight' };
  if (s.round > 1) return { round: s.round - 1, turn: second, phase: 'fight' };
  return s;
}

/** The start of the next player's turn (handing the turn over): like Next from their Fight phase. */
export function nextTurn(s: TurnState, firstTurn: Side): TurnState & { cpGain: boolean; gameOver: boolean } {
  return nextPhase({ ...s, phase: 'fight' }, firstTurn);
}

/** One player's Command phase in one battle round ("2-me"): its CP is given once. */
export const commandKey = (s: { round: number; turn: Side }) => `${s.round}-${s.turn}`;

/**
 * The Command phases whose CP has been given. Games saved before this was
 * kept count every Command phase up to the current turn as given.
 */
export function cpGrantedSoFar(s: TurnState & { cpGranted?: string[] }, firstTurn: Side): string[] {
  if (s.cpGranted) return s.cpGranted;
  const second: Side = firstTurn === 'me' ? 'them' : 'me';
  const keys: string[] = [];
  for (let r = 1; r <= s.round; r++) {
    keys.push(commandKey({ round: r, turn: firstTurn }));
    if (r < s.round || s.turn === second) keys.push(commandKey({ round: r, turn: second }));
  }
  return keys;
}

/**
 * Move to `to` (by Next, handing the turn over or jumping to a round). Arriving
 * at a Command phase whose CP hasn't been given gives it (`cpGain`: both
 * players gain 1 CP) and notes it, so going Back and Next again doesn't give it twice.
 */
export function arrive(s: TurnState & { cpGranted?: string[] }, to: TurnState, firstTurn: Side): TurnState & { cpGranted: string[]; cpGain: boolean } {
  const granted = cpGrantedSoFar(s, firstTurn);
  const key = commandKey(to);
  const cpGain = to.phase === 'command' && !granted.includes(key);
  return { round: to.round, turn: to.turn, phase: to.phase, cpGranted: cpGain ? [...granted, key] : granted, cpGain };
}

export interface Score {
  primary: number[];
  secondary: number[];
}
export const emptyScore = (): Score => ({ primary: Array(ROUNDS).fill(0), secondary: Array(ROUNDS).fill(0) });
export const totalScore = (s: Score) => s.primary.reduce((a, b) => a + b, 0) + s.secondary.reduce((a, b) => a + b, 0);

const PHASE_WORDS: Record<Phase, RegExp> = {
  command: /command phase/i,
  movement: /movement phase|normal move|advance|fall back|reinforcements step/i,
  shooting: /shooting phase|shoots?\b|ranged attack/i,
  charge: /charge phase|charge roll|declares? a charge/i,
  fight: /fight phase|fights?\b|melee attack/i,
};

/** Does an ability's text say it is used in this phase? */
export function abilityInPhase(text: string, phase: Phase): boolean {
  return PHASE_WORDS[phase].test(text);
}

/** Abilities to remember before the battle starts. */
export const PRE_BATTLE = /deep strike|infiltrators|scouts|before the battle|declare battle formations|start of the first battle round|redeploy|deploy(ed|ment)/i;
