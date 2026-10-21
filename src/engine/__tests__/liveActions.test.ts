import { describe, expect, it } from 'vitest';
import { newLiveState, receive, reduce, stampOf, takeOver, withPending, type LiveAction, type LivePlayer, type LiveState, type Pending } from '../live';

const p = (id: string, name: string): LivePlayer => ({ id, name, team: 'A', army: `${name}'s army`, faction: 'X', detachments: [] });

/** Host (team A) and guest (team B), battle started: both on 1 CP, round 1, A's Command phase. */
function oneVsOne(): LiveState {
  let s = newLiveState('R', p('h', 'Host'));
  s = reduce(s, { t: 'join', player: p('g', 'Guest') }, 'g');
  return reduce(s, { t: 'start' }, 'h');
}

/** Ann & Cat (A, Ann hosts) against Bob & Dan (B). */
function twoVsTwo(): LiveState {
  let s = newLiveState('R', p('a1', 'Ann'));
  s = reduce(s, { t: 'setMode', mode: '2v2' }, 'a1');
  for (const [id, n] of [['b1', 'Bob'], ['a2', 'Cat'], ['b2', 'Dan']]) s = reduce(s, { t: 'join', player: p(id!, n!) }, id!);
  return reduce(s, { t: 'start' }, 'a1');
}

/** A phone's queue: each action numbered, the way a guest keeps them. */
function queue(actions: LiveAction[], from = 1): Pending[] {
  return actions.map((action, i) => ({ seq: from + i, action, at: i }));
}

/** What a guest playing on alone does: each action applied to its own copy, stamped with what it saw. */
function playOffline(start: LiveState, me: string, make: ((s: LiveState) => LiveAction)[]): { phone: LiveState; sent: Pending[] } {
  let phone = start;
  const sent: Pending[] = [];
  make.forEach((f, i) => {
    const action = f(phone);
    sent.push({ seq: i + 1, action, at: i });
    phone = reduce(phone, action, me, { local: true });
  });
  return { phone, sent };
}

const replay = (host: LiveState, from: string, sent: Pending[]) => sent.reduce((s, x) => receive(s, x.action, from, x.seq), host);
const next = (s: LiveState): LiveAction => ({ t: 'next', at: stampOf(s) });

describe('live actions: what a guest sends, the host replays', () => {
  it('a cut-off guest ending its turn gives the host team its Command-phase CP (N1)', () => {
    let s = oneVsOne();
    for (let i = 0; i < 5; i++) s = reduce(s, next(s), 'h');
    expect(s).toMatchObject({ round: 1, turn: 'B', phase: 'command' });
    expect(s.cp).toEqual({ h: 2, g: 2 });
    // The guest (team B) plays its whole turn without the host and moves on to round 2.
    const { phone, sent } = playOffline(s, 'g', Array(5).fill(next));
    expect(phone).toMatchObject({ round: 2, turn: 'A', phase: 'command' });
    const host = replay(s, 'g', sent);
    expect(host).toMatchObject({ round: 2, turn: 'A', phase: 'command' });
    // Everyone gains 1 CP at the start of round 2: the host's team too.
    expect(host.cp).toEqual({ h: 3, g: 3 });
    expect(host.acks).toEqual({ g: 5 });
  });

  it('a cut-off guest can only move the turn where the host also was, and only on its own turn', () => {
    const s = oneVsOne();
    // Round 1, A's turn: the guest (B) jumps to round 3 and taps Next on its own copy.
    const { sent } = playOffline(s, 'g', [(st) => ({ t: 'round', round: 3, at: stampOf(st) }), next, next]);
    const host = replay(s, 'g', sent);
    expect(host).toMatchObject({ round: 1, turn: 'A', phase: 'command' });
    expect(host.acks?.g).toBe(3);
    // The host moved on meanwhile: a guest's Next from an older spot is ignored.
    let moved = s;
    for (let i = 0; i < 5; i++) moved = reduce(moved, next(moved), 'h');
    const { sent: late } = playOffline(s, 'g', [next]);
    expect(replay(moved, 'g', late)).toMatchObject({ round: 1, turn: 'B', phase: 'command' });
  });

  it('a double tap on Next moves one phase', () => {
    const s = oneVsOne();
    const tap = next(s);
    const once = reduce(s, tap, 'h');
    expect(reduce(once, tap, 'h')).toBe(once);
    expect(once.phase).toBe('movement');
  });

  it('CP changes made while cut off add up with the host’s instead of replacing them (N2)', () => {
    const s = twoVsTwo();
    expect(s.cp.a2).toBe(1);
    // Cat (team A) is cut off: gains 2 CP from a rule, then uses a 1 CP stratagem.
    const { phone, sent } = playOffline(s, 'a2', [() => ({ t: 'cpAdd', id: 'a2', delta: 2 }), () => ({ t: 'strat', name: 'Grenade', cost: 1 })]);
    expect([phone.cp.a1, phone.cp.a2]).toEqual([2, 2]);
    // Meanwhile Ann spends 1 CP of the shared pool on the host.
    const host = reduce(s, { t: 'strat', name: 'Command Re-roll', cost: 1 }, 'a1');
    const merged = replay(host, 'a2', sent);
    expect([merged.cp.a1, merged.cp.a2]).toEqual([1, 1]);
    expect(merged.cp.b1).toBe(1);
    expect(merged.log.map((l) => l.text).filter((t) => / used /.test(t))).toEqual(['Ann used Command Re-roll (1 CP)', 'Cat used Grenade (1 CP)']);
  });

  it('a stratagem used while cut off, or in an unlinked copy, costs the player’s own CP (N3)', () => {
    const s = oneVsOne();
    const offline = reduce(s, { t: 'strat', name: 'Smokescreen', cost: 1 }, 'g', { local: true });
    expect(offline.cp).toEqual({ h: 1, g: 0 });
    expect(offline.cp['__local__']).toBeUndefined();
    expect(offline.log.at(-1)?.text).toBe('Guest used Smokescreen (1 CP)');
    // Still free to change anything on an unlinked copy.
    expect(reduce(s, { t: 'cpAdd', id: 'h', delta: 3 }, 'g', { local: true }).cp.h).toBe(4);
    // But the host's rules still apply when it arrives.
    expect(receive(s, { t: 'cpAdd', id: 'h', delta: 3 }, 'g', 1).cp.h).toBe(1);
  });

  it('a teammate’s VP and cards scored on the host survive a cut-off phone (N11)', () => {
    let s = twoVsTwo();
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'mode', mode: 'tactical', deck: ['Cleanse', 'Plunder', 'Beacon', 'Outflank', 'Recover'] } }, 'a1');
    s = reduce(s, { t: 'sec', team: 'A', op: { op: 'draw', n: 2, key: '1-A' } }, 'a1');
    // Cat (cut off) scores Cleanse for 4.
    const scoreCleanse: LiveAction = { t: 'batch', actions: [{ t: 'vpAdd', team: 'A', kind: 'secondary', round: 0, delta: 4 }, { t: 'sec', team: 'A', op: { op: 'score', name: 'Cleanse', round: 1 } }] };
    const { sent } = playOffline(s, 'a2', [() => scoreCleanse]);
    // Ann scores Plunder for 3 and the primary for 5 on the host meanwhile.
    let host = reduce(s, { t: 'batch', actions: [{ t: 'vpAdd', team: 'A', kind: 'secondary', round: 0, delta: 3 }, { t: 'sec', team: 'A', op: { op: 'score', name: 'Plunder', round: 1 } }] }, 'a1');
    host = reduce(host, { t: 'vpAdd', team: 'A', kind: 'primary', round: 0, delta: 5 }, 'a1');
    const merged = replay(host, 'a2', sent);
    expect(merged.vp.A.secondary[0]).toBe(7);
    expect(merged.vp.A.primary[0]).toBe(5);
    expect(merged.missions?.A?.tactical?.scored.map((x) => x.name).sort()).toEqual(['Cleanse', 'Plunder']);
  });

  it('a tap with a card that is gone counts for nothing: no CP for a redraw, no VP for a score', () => {
    let s = oneVsOne();
    s = reduce(s, { t: 'sec', team: 'B', op: { op: 'mode', mode: 'tactical', deck: ['Cleanse', 'Plunder', 'Beacon', 'Outflank'] } }, 'g');
    s = reduce(s, { t: 'sec', team: 'B', op: { op: 'draw', n: 2, key: '1-B' } }, 'g');
    const redraw: LiveAction = { t: 'batch', actions: [{ t: 'sec', team: 'B', op: { op: 'redraw', name: 'Cleanse' } }, { t: 'cpAdd', id: 'g', delta: -1 }] };
    const once = reduce(s, redraw, 'g');
    expect(once.cp.g).toBe(0);
    expect(once.missions?.B?.tactical?.active).not.toContain('Cleanse');
    // The same tap again (from a phone that hadn't seen it yet): Cleanse is no longer in hand.
    expect(reduce(once, redraw, 'g')).toBe(once);
  });

  it('the host handles each numbered action once, and counts the ones it turns down', () => {
    const s = oneVsOne();
    const a = receive(s, { t: 'note', text: 'hello' }, 'g', 1);
    expect(a.acks).toEqual({ g: 1 });
    expect(receive(a, { t: 'note', text: 'hello' }, 'g', 1)).toBe(a);
    // Turned down by the rules (the guest can't score for team A), still counted so the phone stops resending it.
    const b = receive(a, { t: 'vpAdd', team: 'A', kind: 'primary', round: 0, delta: 9 }, 'g', 2);
    expect(b.vp.A.primary[0]).toBe(0);
    expect(b.acks).toEqual({ g: 2 });
    // Older phones send actions without a number: applied as before.
    expect(receive(b, { t: 'note', text: 'old phone' }, 'g').log.at(-1)?.text).toBe('old phone');
  });

  it('a guest shows the host’s copy with its own unhandled actions on top', () => {
    const s = oneVsOne();
    const pending = queue([{ t: 'cpAdd', id: 'g', delta: 2 }, { t: 'note', text: 'one' }]);
    expect(withPending(s, pending, 'g').cp.g).toBe(3);
    // Once the host has the first one, it is no longer applied on top.
    const host = receive(s, pending[0]!.action, 'g', 1);
    const view = withPending(host, pending, 'g');
    expect(view.cp.g).toBe(3);
    expect(view.log.at(-1)?.text).toBe('one');
    // Online, the host's rules apply to what is shown; cut off, anything goes until the host checks it.
    const other = queue([{ t: 'cpAdd', id: 'h', delta: 2 }]);
    expect(withPending(s, other, 'g').cp.h).toBe(1);
    expect(withPending(s, other, 'g', true).cp.h).toBe(3);
  });

  it('going back a phase and forward again never gives Command-phase CP twice', () => {
    let s = oneVsOne();
    for (let i = 0; i < 5; i++) s = reduce(s, next(s), 'h');
    expect(s.cp).toEqual({ h: 2, g: 2 });
    s = reduce(s, { t: 'prev' }, 'h');
    expect(s).toMatchObject({ turn: 'A', phase: 'fight' });
    s = reduce(s, next(s), 'h');
    expect(s).toMatchObject({ turn: 'B', phase: 'command' });
    expect(s.cp).toEqual({ h: 2, g: 2 });
    expect(s.log.at(-1)?.text).not.toMatch(/gains/);
    // Older saved games have no record: the turn they are in has had its CP.
    const old: LiveState = { ...s, cpAt: undefined };
    const back = reduce(reduce(old, { t: 'prev' }, 'h'), { t: 'next' }, 'h');
    expect(back.cp).toEqual({ h: 2, g: 2 });
    const on = reduce(reduce(old, { t: 'turn' }, 'h'), { t: 'next' }, 'h');
    expect(on.cp).toEqual({ h: 3, g: 3 });
  });

  it('another player carries on as host from its own copy, with its own actions in', () => {
    let s = twoVsTwo();
    s = receive(s, { t: 'note', text: 'seen by the old host' }, 'b1', 1);
    // Bob (team B) was cut off with two actions the old host never got.
    const pending = queue([{ t: 'note', text: 'seen by the old host' }, { t: 'cpAdd', id: 'b1', delta: 1 }, { t: 'vpAdd', team: 'B', kind: 'primary', round: 0, delta: 4 }]);
    const mine = takeOver(s, pending, 'b1', 'NEWONE');
    expect(mine).toMatchObject({ room: 'NEWONE', hostId: 'b1' });
    expect([mine.cp.b1, mine.cp.b2]).toEqual([2, 2]);
    expect(mine.vp.B.primary[0]).toBe(4);
    expect(mine.log.filter((l) => l.text === 'seen by the old host')).toHaveLength(1);
    expect(mine.log.at(-1)?.text).toBe('Bob carries on as host · new room NEWONE');
    expect(mine.acks?.b1).toBe(3);
    // Ann joins the new room and resends everything she has kept: only what this copy hasn't counted is applied.
    const ann = queue([{ t: 'cpAdd', id: 'a1', delta: 1 }]);
    const after = replay(mine, 'a1', ann);
    expect(after.cp.a1).toBe(2);
    expect(replay(after, 'a1', ann)).toBe(after);
  });
});
