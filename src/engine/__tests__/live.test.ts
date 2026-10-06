import { describe, expect, it } from 'vitest';
import { makeRoomCode, newLiveState, reduce, teamNames, type LivePlayer } from '../live';

const p = (id: string, name: string): LivePlayer => ({ id, name, team: 'A', army: `${name}'s army`, faction: 'X', detachments: [] });

describe('live game reducer', () => {
  it('fills teams, starts, runs turns with CP for everyone, and scores', () => {
    let s = newLiveState('ROOM42', p('h', 'Host'));
    s = reduce(s, { t: 'join', player: p('g', 'Guest') }, 'g');
    expect(s.players.map((x) => x.team)).toEqual(['A', 'B']);
    // Full in 1v1
    expect(reduce(s, { t: 'join', player: p('x', 'Extra') }, 'x')).toBe(s);
    // Only the host starts
    expect(reduce(s, { t: 'start' }, 'g')).toBe(s);
    s = reduce(s, { t: 'start' }, 'h');
    expect(s.stage).toBe('battle');
    expect(s.cp).toEqual({ h: 1, g: 1 });
    // Only the team whose turn it is (or the host) moves the turn on.
    expect(reduce(s, { t: 'next' }, 'g')).toBe(s);
    for (let i = 0; i < 5; i++) s = reduce(s, { t: 'next' }, 'h');
    expect(s).toMatchObject({ turn: 'B', phase: 'command', round: 1 });
    expect(s.cp).toEqual({ h: 2, g: 2 });
    s = reduce(s, { t: 'strat', name: 'Command Re-roll', cost: 1 }, 'g');
    expect(s.cp.g).toBe(1);
    // Guest (team B) can't score for team A or change the host's CP; the host can score A.
    expect(reduce(s, { t: 'vp', team: 'A', kind: 'primary', round: 0, value: 10 }, 'g')).toBe(s);
    expect(reduce(s, { t: 'cp', id: 'h', value: 9 }, 'g')).toBe(s);
    s = reduce(s, { t: 'vp', team: 'A', kind: 'primary', round: 0, value: 10 }, 'h');
    s = reduce(s, { t: 'end' }, 'h');
    expect(s.winner).toBe('A');
    expect(s.log.some((l) => /Command Re-roll/.test(l.text))).toBe(true);
  });

  it('handles 2v2 and rejoining mid-game', () => {
    let s = newLiveState('R', p('a1', 'Ann'));
    s = reduce(s, { t: 'setMode', mode: '2v2' }, 'a1');
    for (const [id, n] of [['b1', 'Bob'], ['a2', 'Cat'], ['b2', 'Dan']]) s = reduce(s, { t: 'join', player: p(id!, n!) }, id!);
    expect(s.players.map((x) => `${x.name}:${x.team}`)).toEqual(['Ann:A', 'Bob:B', 'Cat:A', 'Dan:B']);
    expect(teamNames(s, 'B')).toBe('Bob & Dan');
    s = reduce(s, { t: 'start' }, 'a1');
    const before = s.v;
    s = reduce(s, { t: 'join', player: { ...p('b2', 'Dan'), army: 'new' } }, 'b2');
    expect(s.players.length).toBe(4);
    expect(s.players.find((x) => x.id === 'b2')!.team).toBe('B');
    expect(s.v).toBe(before + 1);
    expect(reduce(s, { t: 'join', player: p('z', 'Late') }, 'z')).toBe(s);
  });

  it('an unlinked copy can change everything', async () => {
    const { LOCAL } = await import('../live');
    let s = newLiveState('R', p('h', 'Host'));
    s = reduce(s, { t: 'join', player: p('g', 'Guest') }, 'g');
    s = reduce(s, { t: 'start' }, 'h');
    s = reduce(s, { t: 'cp', id: 'h', value: 5 }, LOCAL);
    s = reduce(s, { t: 'vp', team: 'B', kind: 'secondary', round: 0, value: 4 }, LOCAL);
    expect(s.cp.h).toBe(5);
    expect(s.vp.B.secondary[0]).toBe(4);
  });

  it('makes readable room codes', () => {
    expect(makeRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
