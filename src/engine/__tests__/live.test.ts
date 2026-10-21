import { describe, expect, it } from 'vitest';
import { makeRoomCode, missionsOf, newLiveState, reduce, teamNames, teamsReady, turnOrder, type LivePlayer } from '../live';

const p = (id: string, name: string): LivePlayer => ({ id, name, team: 'A', army: `${name}'s army`, faction: 'X', detachments: [] });

describe('live game reducer', () => {
  it('fills teams, starts, runs turns with CP for everyone, and scores', () => {
    let s = newLiveState('ROOM42', p('h', 'Host'));
    s = reduce(s, { t: 'join', player: p('g', 'Guest') }, 'g');
    expect(s.players.map((x) => x.team)).toEqual(['A', 'B']);
    // A third player turns the lobby into a 2v1
    const three = reduce(s, { t: 'join', player: p('x', 'Extra') }, 'x');
    expect(three.mode).toBe('2v1');
    expect(three.players).toHaveLength(3);
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

  it('tapping the turn banner hands the turn over', () => {
    let s = newLiveState('R', p('h', 'Host'));
    s = reduce(s, { t: 'join', player: p('g', 'Guest') }, 'g');
    s = reduce(s, { t: 'start' }, 'h');
    s = reduce(s, { t: 'phase', phase: 'shooting' }, 'h');
    s = reduce(s, { t: 'turn' }, 'h');
    expect(s).toMatchObject({ turn: 'B', phase: 'command' });
    // Like Next: the new turn's Command phase gives everyone 1 CP.
    expect(s.cp).toEqual({ h: 2, g: 2 });
    // The team whose turn it is hands it on: after the last team, the next round starts.
    s = reduce(s, { t: 'turn' }, 'g');
    expect(s).toMatchObject({ round: 2, turn: 'A', phase: 'command' });
    expect(s.cp).toEqual({ h: 3, g: 3 });
  });

  it('plays a 2v1 with the pair on either team', () => {
    let s = newLiveState('R', p('h', 'Host'));
    s = reduce(s, { t: 'setMode', mode: '2v1' }, 'h');
    s = reduce(s, { t: 'join', player: p('g', 'Guest') }, 'g');
    s = reduce(s, { t: 'join', player: p('x', 'Extra') }, 'x');
    expect(teamsReady(s)).toBe(true);
    expect(s.players.map((x) => x.team).sort()).toEqual(['A', 'A', 'B']);
    // The pair can be team B instead.
    s = reduce(s, { t: 'setTeam', id: 'h', team: 'B' }, 'h');
    expect(teamsReady(s)).toBe(true);
    s = reduce(s, { t: 'setTeam', id: 'g', team: 'B' }, 'h');
    expect(teamsReady(s)).toBe(false);
  });

  it('runs a three-player free-for-all turn by turn', () => {
    let s = newLiveState('R', p('a', 'Ann'));
    s = reduce(s, { t: 'setMode', mode: 'ffa' }, 'a');
    s = reduce(s, { t: 'join', player: p('b', 'Bob') }, 'b');
    s = reduce(s, { t: 'join', player: p('c', 'Cat') }, 'c');
    expect(s.players.map((x) => x.team)).toEqual(['A', 'B', 'C']);
    s = reduce(s, { t: 'setFirst', team: 'B' }, 'a');
    expect(turnOrder(s)).toEqual(['B', 'C', 'A']);
    s = reduce(s, { t: 'start' }, 'a');
    expect(s.vp.C).toBeDefined();
    const fights = (st: typeof s) => {
      for (let i = 0; i < 5; i++) st = reduce(st, { t: 'next' }, 'a');
      return st;
    };
    s = fights(s);
    expect(s).toMatchObject({ round: 1, turn: 'C', phase: 'command' });
    s = fights(s);
    expect(s).toMatchObject({ round: 1, turn: 'A' });
    s = fights(s);
    expect(s).toMatchObject({ round: 2, turn: 'B' });
    // Back over the round boundary.
    s = reduce(s, { t: 'prev' }, 'a');
    expect(s).toMatchObject({ round: 1, turn: 'A', phase: 'fight' });
    s = reduce(s, { t: 'vp', team: 'C', kind: 'primary', round: 0, value: 7 }, 'c');
    s = reduce(s, { t: 'end' }, 'a');
    expect(s.winner).toBe('C');
  });

  it('shares one CP pool per team when asked', () => {
    let s = newLiveState('R', p('a1', 'Ann'));
    s = reduce(s, { t: 'setMode', mode: '2v2' }, 'a1');
    for (const [id, n] of [['b1', 'Bob'], ['a2', 'Cat'], ['b2', 'Dan']]) s = reduce(s, { t: 'join', player: p(id!, n!) }, id!);
    expect(s.sharedCp).toBe(true);
    s = reduce(s, { t: 'start' }, 'a1');
    s = reduce(s, { t: 'cp', id: 'a2', value: 4 }, 'a1');
    expect([s.cp.a1, s.cp.a2, s.cp.b1]).toEqual([4, 4, 1]);
    s = reduce(s, { t: 'strat', name: 'Command Re-roll', cost: 1 }, 'a2');
    expect([s.cp.a1, s.cp.a2]).toEqual([3, 3]);
    // Not the other team's pool.
    expect(reduce(s, { t: 'cp', id: 'b1', value: 9 }, 'a1')).toBe(s);
    // The old on/off switch does nothing: teams always share.
    expect(reduce(s, { t: 'setSharedCp', on: false }, 'a1')).toBe(s);
  });

  it('keeps each team secondaries in the shared state, read by everyone', () => {
    let s = newLiveState('R', p('a1', 'Ann'));
    s = reduce(s, { t: 'setMode', mode: '2v2' }, 'a1');
    for (const [id, n] of [['b1', 'Bob'], ['a2', 'Cat'], ['b2', 'Dan']]) s = reduce(s, { t: 'join', player: p(id!, n!) }, id!);
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'mode', mode: 'tactical', deck: ['Cleanse', 'Plunder', 'Beacon', 'Outflank'] } }, 'a2');
    // The other team can't change it.
    expect(reduce(s, { t: 'sec', team: 'A', op: { op: 'draw', n: 2, key: '1-A' } }, 'b1')).toBe(s);
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'draw', n: 2, key: '1-A' } }, 'a1');
    expect(missionsOf(s, 'A').tactical?.active).toEqual(['Cleanse', 'Plunder']);
    // Once per turn.
    expect(reduce(s, { t: 'sec', team: 'A', op: { op: 'draw', n: 2, key: '1-A' } }, 'a2')).toBe(s);
    // Redraw as often as you like.
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'redraw', name: 'Cleanse' } }, 'a2');
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'redraw', name: 'Plunder' } }, 'a2');
    expect(missionsOf(s, 'A').tactical).toMatchObject({ active: ['Beacon', 'Outflank'], redraws: 2 });
    // Free: one more card any time, and a card shuffled back for a new one (never the same card back).
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'drawFree' } }, 'a1');
    expect(missionsOf(s, 'A').tactical!.active).toHaveLength(3);
    const back = missionsOf(s, 'A').tactical!.active[0]!;
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'shuffleBack', name: back, at: 1 } }, 'a1');
    expect(missionsOf(s, 'A').tactical!.active).not.toContain(back);
    expect(missionsOf(s, 'A').tactical!.active).toHaveLength(3);
    expect(missionsOf(s, 'A').tactical!.deck).toContain(back);
    // Pick a card from the list of all secondaries: it leaves the deck or the discards.
    const pickable = missionsOf(s, 'A').tactical!.discarded[0]!;
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'take', name: pickable } }, 'a1');
    expect(missionsOf(s, 'A').tactical!.active).toContain(pickable);
    expect(missionsOf(s, 'A').tactical!.discarded).not.toContain(pickable);
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'primaryDone', round: 1, done: true } }, 'a1');
    expect(missionsOf(s, 'A').primaryDone).toEqual([1]);
    expect(missionsOf(s, 'B')).toEqual({ fixed: [] });
  });

  it('works out primaries from the dispositions; a team shares one', () => {
    let s = newLiveState('R', p('a1', 'Ann'));
    s = reduce(s, { t: 'setMode', mode: '2v2' }, 'a1');
    for (const [id, n] of [['b1', 'Bob'], ['a2', 'Cat'], ['b2', 'Dan']]) s = reduce(s, { t: 'join', player: p(id!, n!) }, id!);
    s = reduce(s, { t: 'setPrimary', disposition: 'Purge the Foe' }, 'a2');
    expect(s.players.filter((x) => x.team === 'A').map((x) => x.disposition)).toEqual(['Purge the Foe', 'Purge the Foe']);
    expect(s.players.find((x) => x.id === 'a1')!.primary).toBeUndefined();
    s = reduce(s, { t: 'setPrimary', disposition: 'Take and Hold' }, 'b1');
    expect(s.players.find((x) => x.id === 'a1')!.primary).toBe('Unstoppable Force');
    expect(s.players.find((x) => x.id === 'b2')!.primary).toBe('Immovable Object');
    // Picked by hand: kept when the dispositions change.
    s = reduce(s, { t: 'setPrimary', mission: 'Sabotage', manual: true }, 'a1');
    s = reduce(s, { t: 'setPrimary', disposition: 'Disruption' }, 'b2');
    expect(s.players.find((x) => x.id === 'a2')!.primary).toBe('Sabotage');
    expect(s.players.find((x) => x.id === 'b1')!.primary).toBe('Delaying Action');
  });

  it('folds in an older phone’s cut-off copy: its own team only, never the other team', async () => {
    const { mergeOffline, LOCAL } = await import('../live');
    let s = newLiveState('R', p('h', 'Host'));
    s = reduce(s, { t: 'join', player: p('g', 'Guest') }, 'g');
    s = reduce(s, { t: 'start' }, 'h');
    const base = s;
    // The guest (team B) plays on alone: moves the game on, spends CP, scores, and (locally) edits the host's score.
    let phone = base;
    for (let i = 0; i < 5; i++) phone = reduce(phone, { t: 'next' }, LOCAL);
    phone = reduce(phone, { t: 'cp', id: 'g', value: 5 }, LOCAL);
    phone = reduce(phone, { t: 'vp', team: 'B', kind: 'secondary', round: 0, value: 4 }, LOCAL);
    phone = reduce(phone, { t: 'vp', team: 'A', kind: 'primary', round: 0, value: 99 }, LOCAL);
    phone = reduce(phone, { t: 'cp', id: 'h', value: 9 }, LOCAL);
    phone = reduce(phone, { t: 'note', text: 'Charged the objective' }, LOCAL);
    // Meanwhile the host scored and spent CP.
    let host = reduce(base, { t: 'vp', team: 'A', kind: 'primary', round: 0, value: 6 }, 'h');
    host = reduce(host, { t: 'cp', id: 'h', value: 0 }, 'h');
    const merged = mergeOffline(host, phone, base, 'g');
    expect(merged.vp.B.secondary[0]).toBe(4);
    expect(merged.cp.g).toBe(5);
    // The other team keeps what the host has.
    expect(merged.vp.A.primary[0]).toBe(6);
    expect(merged.cp.h).toBe(0);
    // The turn stays where the host has it (taking it from the phone skipped the host's Command-phase CP); the log gets the offline note.
    expect(merged).toMatchObject({ round: 1, turn: 'A', phase: 'command' });
    expect(merged.log.some((l) => l.text === 'Charged the objective')).toBe(true);
    expect(merged.v).toBe(host.v + 1);
  });

  it('keeps a teammate’s newer change when the cut-off phone left that field alone', async () => {
    const { mergeOffline, LOCAL } = await import('../live');
    let s = newLiveState('R', p('a1', 'Ann'));
    s = reduce(s, { t: 'setMode', mode: '2v2' }, 'a1');
    for (const [id, n] of [['b1', 'Bob'], ['a2', 'Cat'], ['b2', 'Dan']]) s = reduce(s, { t: 'join', player: p(id!, n!) }, id!);
    s = reduce(s, { t: 'start' }, 'a1');
    const base = s;
    // Cat is cut off and only writes a note; Ann spends the shared CP on the host meanwhile.
    const phone = reduce(base, { t: 'note', text: 'hi' }, LOCAL);
    const host = reduce(base, { t: 'cp', id: 'a1', value: 0 }, 'a1');
    const merged = mergeOffline(host, phone, base, 'a2');
    expect([merged.cp.a1, merged.cp.a2]).toEqual([0, 0]);
    // A phone that is behind the host doesn't pull the turn back.
    const behind = mergeOffline(reduce(host, { t: 'next' }, 'a1'), phone, base, 'a2');
    expect(behind.phase).toBe('movement');
  });

  it('makes readable room codes', () => {
    expect(makeRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
