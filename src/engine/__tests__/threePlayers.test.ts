import { describe, expect, it } from 'vitest';
import { missionsOf, newLiveState, reduce, teamsReady, turnOrder, vpOf, type LiveAction, type LivePlayer, type LiveState } from '../live';
import { totalScore } from '../game';

const p = (id: string, name: string): LivePlayer => ({ id, name, team: 'A', army: `${name}'s army`, faction: 'X', detachments: [] });
const teamOf = (s: LiveState, id: string) => s.players.find((x) => x.id === id)!.team;
/** End the current team's turn the way its player does: Next through every phase, from that player's phone. */
const playTurn = (s: LiveState, by: string) => {
  for (let i = 0; i < 5; i++) s = reduce(s, { t: 'next', at: { round: s.round, turn: s.turn, phase: s.phase } }, by);
  return s;
};
/** Score a secondary as the Missions tab does: the card's part and its VP in one tap. */
const tick = (s: LiveState, by: string, name: string, round: number, vp: number, prev = 0, team = teamOf(s, by)): LiveState => {
  const a: LiveAction = {
    t: 'batch',
    actions: [
      { t: 'sec', team, op: { op: 'secSet', name, round, part: 'turn', vp, counts: { 0: vp ? [1] : [] }, prev } },
      { t: 'vpAdd', team, kind: 'secondary', round: round - 1, delta: vp - prev },
    ],
  };
  return reduce(s, a, by);
};

describe('three players: 1v1v1', () => {
  it('three who joined as a 2v1 become three teams when the host picks 3 players', () => {
    let s = newLiveState('R', p('a', 'Ann'));
    s = reduce(s, { t: 'join', player: p('b', 'Bob') }, 'b');
    s = reduce(s, { t: 'join', player: p('c', 'Cat') }, 'c');
    expect(s.mode).toBe('2v1');
    s = reduce(s, { t: 'setMode', mode: 'ffa' }, 'a');
    expect(s.players.map((x) => x.team).sort()).toEqual(['A', 'B', 'C']);
    expect(teamOf(s, 'a')).toBe('A');
    expect(teamsReady(s)).toBe(true);
    // And back: two of them pair up again.
    s = reduce(s, { t: 'setMode', mode: '2v1' }, 'a');
    expect(s.players.map((x) => x.team).sort()).toEqual(['A', 'A', 'B']);
    expect(teamsReady(s)).toBe(true);
  });

  it('plays a whole game: each player their own turn, CP, missions and score; the top score wins', () => {
    let s = newLiveState('R', p('a', 'Ann'));
    s = reduce(s, { t: 'setMode', mode: 'ffa' }, 'a');
    s = reduce(s, { t: 'join', player: p('b', 'Bob') }, 'b');
    s = reduce(s, { t: 'join', player: p('c', 'Cat') }, 'c');
    // Against two different dispositions there is no card to read: each picks their primary by hand.
    s = reduce(s, { t: 'setPrimary', disposition: 'Take and Hold' }, 'a');
    s = reduce(s, { t: 'setPrimary', disposition: 'Purge the Foe' }, 'b');
    s = reduce(s, { t: 'setPrimary', disposition: 'Scorched Earth' }, 'c');
    expect(s.players.find((x) => x.id === 'a')!.primary).toBeUndefined();
    s = reduce(s, { t: 'setPrimary', mission: 'Supply Drop', manual: true }, 'a');
    expect(s.players.find((x) => x.id === 'a')!.primary).toBe('Supply Drop');
    // Each picks their own secondaries; nobody else can.
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'mode', mode: 'tactical', deck: ['Cleanse', 'Beacon', 'Plunder', 'Outflank'] } }, 'a');
    s = reduce(s, { t: 'sec', team: 'B', op: { op: 'mode', mode: 'fixed' } }, 'b');
    s = reduce(s, { t: 'sec', team: 'B', op: { op: 'fixed', cards: ['Assassination', 'Bring It Down'] } }, 'b');
    expect(reduce(s, { t: 'sec', team: 'C', op: { op: 'mode', mode: 'fixed' } }, 'a')).toBe(s);
    s = reduce(s, { t: 'sec', team: 'C', op: { op: 'mode', mode: 'tactical', deck: ['Cleanse', 'Beacon'] } }, 'c');
    s = reduce(s, { t: 'setFirst', team: 'C' }, 'a');
    expect(turnOrder(s)).toEqual(['C', 'A', 'B']);
    s = reduce(s, { t: 'start' }, 'a');
    expect(s).toMatchObject({ stage: 'battle', round: 1, turn: 'C', phase: 'command', cp: { a: 0, b: 0, c: 0 } });

    // Round 1: Cat goes first. Only Cat (or the host) moves Cat's turn on.
    expect(reduce(s, { t: 'next' }, 'b')).toBe(s);
    s = reduce(s, { t: 'cpAdd', id: 'c', delta: 1 }, 'c');
    expect(reduce(s, { t: 'cpAdd', id: 'c', delta: 5 }, 'b')).toBe(s);
    s = playTurn(s, 'c');
    expect(s).toMatchObject({ round: 1, turn: 'A', phase: 'command' });
    // Ann draws, scores one card at the end of her turn, discards the other.
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'drawFree' } }, 'a');
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'drawFree' } }, 'a');
    expect(missionsOf(s, 'A').tactical!.active).toEqual(['Cleanse', 'Beacon']);
    s = tick(s, 'a', 'Cleanse', 1, 3);
    s = tick(s, 'a', 'Cleanse', 1, 5, 3);
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'discard', name: 'Beacon' } }, 'a');
    expect(vpOf(s, 'A').secondary[0]).toBe(5);
    // Bob can't score Ann's cards or her VP, nor a Fixed card he didn't choose.
    expect(tick(s, 'b', 'Cleanse', 1, 6, 5, 'A')).toBe(s);
    expect(tick(s, 'b', 'Plunder', 1, 4)).toBe(s);
    s = playTurn(s, 'a');
    expect(s).toMatchObject({ round: 1, turn: 'B' });
    s = reduce(s, { t: 'vpAdd', team: 'B', kind: 'primary', round: 0, delta: 4 }, 'b');
    s = playTurn(s, 'b');
    expect(s).toMatchObject({ round: 2, turn: 'C', phase: 'command' });

    // Round 2: Ann's card scored in round 1 is not in her hand; it is kept with its round-1 score.
    const a2 = missionsOf(s, 'A');
    expect(a2.tactical).toMatchObject({ active: [], scored: [{ name: 'Cleanse', round: 1 }], discarded: ['Beacon'] });
    expect(a2.secParts).toEqual([{ name: 'Cleanse', round: 1, part: 'turn', vp: 5, counts: { 0: [1] } }]);
    // It can't be scored again in round 2.
    expect(tick(s, 'a', 'Cleanse', 2, 3).v).toBe(s.v);
    // Taking the discarded card back into the hand.
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'take', name: 'Beacon' } }, 'a');
    expect(missionsOf(s, 'A').tactical).toMatchObject({ active: ['Beacon'], discarded: [] });
    // Undoing the round-1 score from round 2 takes its VP off round 1.
    s = tick(s, 'a', 'Cleanse', 1, 0, 5);
    expect(vpOf(s, 'A').secondary[0]).toBe(0);
    s = tick(s, 'a', 'Cleanse', 1, 5, 0);
    expect(vpOf(s, 'A').secondary[0]).toBe(5);

    // Play out the rest of the game.
    while (!(s.round === 5 && s.turn === 'B' && s.phase === 'fight')) s = reduce(s, { t: 'next', at: { round: s.round, turn: s.turn, phase: s.phase } }, s.players.find((x) => x.team === s.turn)!.id);
    // Past the last fight phase nothing moves on: the host ends the game.
    expect(reduce(s, { t: 'next', at: { round: 5, turn: 'B', phase: 'fight' } }, 'b')).toBe(s);
    s = reduce(s, { t: 'vpAdd', team: 'C', kind: 'primary', round: 4, delta: 12 }, 'c');
    expect(reduce(s, { t: 'end' }, 'b').stage).toBe('battle');
    s = reduce(s, { t: 'end' }, 'a');
    expect(s.winner).toBe('C');
    expect([totalScore(vpOf(s, 'A')), totalScore(vpOf(s, 'B')), totalScore(vpOf(s, 'C'))]).toEqual([5, 4, 12]);
  });
});

describe('three players: 2v1', () => {
  it('plays a whole game: the pair share a turn, CP and secondaries; the solo player has their own', () => {
    let s = newLiveState('R', p('h', 'Host'));
    s = reduce(s, { t: 'join', player: p('g', 'Gus') }, 'g');
    s = reduce(s, { t: 'join', player: p('x', 'Xia') }, 'x');
    expect(s.mode).toBe('2v1');
    expect([teamOf(s, 'h'), teamOf(s, 'g'), teamOf(s, 'x')]).toEqual(['A', 'B', 'A']);
    expect(teamsReady(s)).toBe(true);
    // The pair plays one disposition and gets the primary from the solo player's.
    s = reduce(s, { t: 'setPrimary', disposition: 'Take and Hold' }, 'x');
    expect(s.players.filter((q) => q.team === 'A').map((q) => q.disposition)).toEqual(['Take and Hold', 'Take and Hold']);
    s = reduce(s, { t: 'setPrimary', disposition: 'Purge the Foe' }, 'g');
    expect(s.players.find((q) => q.id === 'h')!.primary).toBeDefined();
    expect(s.players.find((q) => q.id === 'h')!.primary).toBe(s.players.find((q) => q.id === 'x')!.primary);
    s = reduce(s, { t: 'setAttacker', team: 'B' }, 'g');
    // Either of the pair sets their shared secondaries.
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'mode', mode: 'tactical', deck: ['Cleanse', 'Beacon', 'Plunder'] } }, 'x');
    s = reduce(s, { t: 'sec', team: 'B', op: { op: 'mode', mode: 'fixed' } }, 'g');
    s = reduce(s, { t: 'start' }, 'h');
    expect(s).toMatchObject({ stage: 'battle', turn: 'A', attacker: 'B' });

    // One CP pool for the pair.
    s = reduce(s, { t: 'cpAdd', id: 'x', delta: 2 }, 'x');
    expect([s.cp.h, s.cp.x, s.cp.g]).toEqual([2, 2, 0]);
    s = reduce(s, { t: 'strat', name: 'Command Re-roll', cost: 1 }, 'h');
    expect([s.cp.h, s.cp.x]).toEqual([1, 1]);
    // Either of the pair moves their turn on; the solo player can't.
    expect(reduce(s, { t: 'next', at: { round: 1, turn: 'A', phase: 'command' } }, 'g')).toBe(s);
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'drawFree' } }, 'x');
    s = tick(s, 'h', 'Cleanse', 1, 4);
    expect(missionsOf(s, 'A').tactical!.scored).toEqual([{ name: 'Cleanse', round: 1 }]);
    s = playTurn(s, 'x');
    expect(s).toMatchObject({ round: 1, turn: 'B' });
    s = playTurn(s, 'g');
    expect(s).toMatchObject({ round: 2, turn: 'A' });
    // Round 2: the pair's scored card stays scored (not drawable, not in hand).
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'drawFree' } }, 'h');
    expect(missionsOf(s, 'A').tactical!.active).toEqual(['Beacon']);
    s = reduce(s, { t: 'vpAdd', team: 'B', kind: 'primary', round: 1, delta: 10 }, 'g');
    s = reduce(s, { t: 'end' }, 'h');
    expect(s.winner).toBe('B');
  });
});
