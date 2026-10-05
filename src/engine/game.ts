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
