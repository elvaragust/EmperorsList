import { describe, expect, it } from 'vitest';
import { arrive, cpGrantedSoFar, nextPhase, nextTurn, previousPhase, type TurnState } from '../game';
import { applySecOp, type SecondaryState } from '../missions';

describe('Command-phase CP', () => {
  it('is given once per round and turn: Back then Next does not give it again', () => {
    let s: TurnState & { cpGranted?: string[] } = { round: 1, turn: 'me', phase: 'fight', cpGranted: ['1-me'] };
    const a = arrive(s, nextPhase(s, 'me'), 'me');
    expect(a).toMatchObject({ round: 1, turn: 'them', phase: 'command', cpGain: true });
    s = a;
    s = { ...s, ...previousPhase(s, 'me') };
    expect(s).toMatchObject({ round: 1, turn: 'me', phase: 'fight' });
    const again = arrive(s, nextPhase(s, 'me'), 'me');
    expect(again.cpGain).toBe(false);
    expect(again.cpGranted).toEqual(['1-me', '1-them']);
  });
  it('counts every Command phase so far as given in games saved before it was noted', () => {
    expect(cpGrantedSoFar({ round: 2, turn: 'me', phase: 'shooting' }, 'them')).toEqual(['1-them', '1-me', '2-them', '2-me']);
    expect(cpGrantedSoFar({ round: 2, turn: 'them', phase: 'command' }, 'them')).toEqual(['1-them', '1-me', '2-them']);
    // Back across the turn and Next again in an older save: no second CP.
    const back = { round: 2, turn: 'me' as const, phase: 'fight' as const };
    expect(arrive(back, nextPhase(back, 'me'), 'me').cpGain).toBe(true);
    const old = { round: 2, turn: 'them' as const, phase: 'command' as const };
    const prev = { ...previousPhase(old, 'me'), cpGranted: cpGrantedSoFar(old, 'me') };
    expect(arrive(prev, nextPhase(prev, 'me'), 'me').cpGain).toBe(false);
  });
  it('hands the turn over like Next to the start of the next turn', () => {
    expect(nextTurn({ round: 2, turn: 'me', phase: 'shooting' }, 'me')).toMatchObject({ round: 2, turn: 'them', phase: 'command', gameOver: false });
    expect(nextTurn({ round: 2, turn: 'them', phase: 'movement' }, 'me')).toMatchObject({ round: 3, turn: 'me', phase: 'command' });
    expect(nextTurn({ round: 5, turn: 'them', phase: 'command' }, 'me').gameOver).toBe(true);
    const s = { round: 2, turn: 'them' as const, phase: 'movement' as const, cpGranted: ['1-me', '1-them', '2-me', '2-them'] };
    expect(arrive(s, nextTurn(s, 'me'), 'me')).toMatchObject({ round: 3, turn: 'me', cpGain: true });
  });
  it('jumping to an earlier round gives no CP; to a later one, once', () => {
    const s = { round: 3, turn: 'me' as const, phase: 'shooting' as const };
    expect(arrive(s, { round: 2, turn: 'me', phase: 'command' }, 'me').cpGain).toBe(false);
    const fwd = arrive(s, { round: 4, turn: 'me', phase: 'command' }, 'me');
    expect(fwd.cpGain).toBe(true);
    expect(arrive(fwd, { round: 4, turn: 'me', phase: 'command' }, 'me').cpGain).toBe(false);
  });
});

describe('primary scored part by part', () => {
  const base: SecondaryState = { fixed: [] };
  it('locks each part of a round on its own, once', () => {
    let s = applySecOp(base, { op: 'primaryDone', round: 2, done: true, part: 'command', vp: 4, counts: { 1: [1] } });
    s = applySecOp(s, { op: 'primaryDone', round: 2, done: true, part: 'turn', vp: 7, counts: { 0: [1], 2: [1] } });
    expect(s.primaryParts?.map((p) => [p.round, p.part, p.vp])).toEqual([
      [2, 'command', 4],
      [2, 'turn', 7],
    ]);
    // A second Add of the same part (double tap, another phone) changes nothing.
    expect(applySecOp(s, { op: 'primaryDone', round: 2, done: true, part: 'turn', vp: 7 })).toBe(s);
    // Undo opens only that part.
    const undone = applySecOp(s, { op: 'primaryDone', round: 2, done: false, part: 'command' });
    expect(undone.primaryParts?.map((p) => p.part)).toEqual(['turn']);
    expect(s.primaryDone).toBeUndefined();
  });
  it('keeps the older whole-round lock working', () => {
    const s = applySecOp({ fixed: [], primaryDone: [1, 2] }, { op: 'primaryDone', round: 2, done: false });
    expect(s.primaryDone).toEqual([1]);
  });
});
