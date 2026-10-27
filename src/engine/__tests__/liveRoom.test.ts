import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedGame } from '@/data/db';
import { LOCAL, newLiveState, reduce, stampOf, type LivePlayer, type LiveState } from '../live';
import { continueAsHost, moveToRoom, Room, type ConnLike, type LiveSaved, type PeerLike, type RoomDeps } from '@/sync/room';

/* ---------- a fake matchmaking server and phone-to-phone links ---------- */

type Handler = (...args: never[]) => void;
class Emitter {
  private handlers = new Map<string, Handler[]>();
  on(ev: string, fn: Handler) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]);
    return this;
  }
  emit(ev: string, ...args: unknown[]) {
    for (const f of this.handlers.get(ev) ?? []) (f as (...a: unknown[]) => void)(...args);
  }
}
const later = (f: () => void) => void Promise.resolve().then(f);

class FakeConn extends Emitter implements ConnLike {
  open = false;
  other?: FakeConn;
  constructor(readonly peer: string) {
    super();
  }
  send(d: unknown) {
    if (!this.open) return;
    const to = this.other!;
    const copy = structuredClone(d);
    later(() => to.open && to.emit('data', copy));
  }
  close() {
    for (const c of [this, this.other]) {
      if (!c) continue;
      const was = c.open;
      c.open = false;
      if (was) later(() => c.emit('close'));
    }
  }
}

class FakeNet {
  peers = new Map<string, FakePeer>();
  all: FakePeer[] = [];
  n = 0;
  async make(id?: string): Promise<PeerLike> {
    const p = new FakePeer(this, id ?? `guest-${++this.n}`);
    this.all.push(p);
    setTimeout(() => p.register(), 1);
    return p;
  }
}

class FakePeer extends Emitter implements PeerLike {
  open = false;
  destroyed = false;
  disconnected = false;
  dials = 0;
  conns: FakeConn[] = [];
  constructor(
    private net: FakeNet,
    readonly id: string,
  ) {
    super();
  }
  register() {
    if (this.destroyed) return;
    const holder = this.net.peers.get(this.id);
    if (holder && holder !== this && !holder.destroyed) {
      this.emit('error', { type: 'unavailable-id' });
      this.destroy();
      return;
    }
    this.net.peers.set(this.id, this);
    this.open = true;
    this.disconnected = false;
    this.emit('open', this.id);
  }
  connect(id: string): ConnLike {
    this.dials++;
    const mine = new FakeConn(id);
    this.conns.push(mine);
    later(() => {
      const target = this.net.peers.get(id);
      if (!target || !target.open || target.destroyed) return this.emit('error', { type: 'peer-unavailable' });
      const theirs = new FakeConn(this.id);
      mine.other = theirs;
      theirs.other = mine;
      target.conns.push(theirs);
      target.emit('connection', theirs);
      mine.open = theirs.open = true;
      later(() => {
        theirs.emit('open');
        mine.emit('open');
      });
    });
    return mine;
  }
  /** The matchmaking server drops us; links between phones keep working. */
  serverDrop() {
    this.open = false;
    this.disconnected = true;
    if (this.net.peers.get(this.id) === this) this.net.peers.delete(this.id);
    this.emit('error', { type: 'network' });
    this.emit('disconnected');
  }
  reconnect() {
    if (this.destroyed) throw new Error('destroyed');
    this.disconnected = false;
    later(() => this.register());
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.open = false;
    if (this.net.peers.get(this.id) === this) this.net.peers.delete(this.id);
    this.conns.forEach((c) => c.close());
  }
}

/* ---------- saved games in memory ---------- */

class Store {
  games = new Map<string, SavedGame>();
  load = async (id: string) => structuredClone(this.games.get(id));
  save = async (id: string, patch: Partial<SavedGame>) => {
    const g = this.games.get(id);
    if (g) this.games.set(id, { ...g, ...structuredClone(patch) });
    return 1;
  };
  live = (id: string) => this.games.get(id)!.live as LiveSaved;
}

const player = (id: string, name: string): LivePlayer => ({ id, name, team: 'A', army: 'x', faction: 'X', detachments: [] });
const H = player('h', 'Host');
const G = player('g', 'Guest');

let net: FakeNet;
let store: Store;
let deps: RoomDeps;
const rooms: Room[] = [];

function saved(id: string, live: LiveSaved): void {
  store.games.set(id, { id, stage: 'battle', live } as unknown as SavedGame);
}
function open(id: string): Room {
  const live = store.live(id);
  const r = new Room(id, live.role, live.room, live.me, live, deps);
  rooms.push(r);
  return r;
}
const settle = (ms = 50) => vi.advanceTimersByTimeAsync(ms);

/** A 1v1 in battle: host phone "host", guest phone "guest", both in room ROOM01, both on 1 CP (added by hand). */
async function battle(): Promise<{ host: Room; guest: Room; start: LiveState }> {
  let s = newLiveState('ROOM01', H);
  s = reduce(s, { t: 'join', player: G }, 'g');
  s = reduce(s, { t: 'start' }, 'h');
  s = ['h', 'g'].reduce((st, id) => reduce(st, { t: 'cp', id, value: 1 }, LOCAL), s);
  saved('host', { room: 'ROOM01', role: 'host', myId: 'h', myName: 'Host', me: H, state: s });
  saved('guest', { room: 'ROOM01', role: 'guest', myId: 'g', myName: 'Guest', me: G, state: s });
  const host = open('host');
  await settle();
  const guest = open('guest');
  await settle();
  return { host, guest, start: s };
}

beforeEach(() => {
  vi.useFakeTimers();
  net = new FakeNet();
  store = new Store();
  deps = { makePeer: (id) => net.make(id), load: store.load, save: store.save };
});
afterEach(() => {
  rooms.splice(0).forEach((r) => r.close());
  vi.useRealTimers();
});

describe('live rooms', () => {
  it('a guest’s action reaches the host once and leaves its outbox when handled', async () => {
    const { host, guest } = await battle();
    expect([host.status, guest.status, host.peers]).toEqual(['online', 'online', 1]);
    guest.dispatch({ t: 'cpAdd', id: 'g', delta: 2 });
    await settle();
    expect(host.current?.cp.g).toBe(3);
    expect(host.current?.acks).toEqual({ g: 1 });
    expect(guest.unsent).toBe(0);
    await guest.flush();
    expect(store.live('guest').state?.cp.g).toBe(3);
  });

  it('cut off, a guest plays on; its actions survive a reload and are replayed with the host’s rules (N1, N3, N7)', async () => {
    const { host, guest } = await battle();
    // Host (team A) takes its turn to the end, then the guest's phone loses the host.
    for (let i = 0; i < 5; i++) host.dispatch({ t: 'next', at: stampOf(host.current!) });
    await settle();
    expect(guest.current).toMatchObject({ turn: 'B', phase: 'command' });
    net.peers.get('emperorslist-ROOM01')!.destroy();
    await settle();
    expect(guest.cutOff).toBe(true);
    // Guest uses a stratagem and plays its whole turn alone.
    guest.dispatch({ t: 'strat', name: 'Smokescreen', cost: 1 });
    for (let i = 0; i < 5; i++) guest.dispatch({ t: 'next', at: stampOf(guest.current!) });
    expect(guest.current).toMatchObject({ round: 2, turn: 'A' });
    expect(guest.current?.cp).toEqual({ h: 1, g: 0 });
    await guest.flush();
    expect(store.live('guest').outbox).toHaveLength(6);
    // The guest's app is reloaded while the host is gone.
    guest.close();
    const again = open('guest');
    expect(again.current).toMatchObject({ round: 2, turn: 'A' });
    // The host comes back (its app reopened).
    host.close();
    const host2 = open('host');
    await settle(5000);
    expect(host2.status).toBe('online');
    await settle(10_000);
    expect(again.status).toBe('online');
    // Replayed by the host: no CP given for the new round, the guest's stratagem cost the guest.
    expect(host2.current).toMatchObject({ round: 2, turn: 'A', phase: 'command' });
    expect(host2.current?.cp).toEqual({ h: 1, g: 0 });
    expect(host2.current?.log.some((l) => l.text === 'Guest used Smokescreen (1 CP)')).toBe(true);
    expect(again.unsent).toBe(0);
    expect(again.current?.cp).toEqual({ h: 1, g: 0 });
  });

  it('the host keeps updating a guest whose new link arrives before the old one closes (N4)', async () => {
    const { host, guest } = await battle();
    const old = net.all.find((p) => p.id.startsWith('guest-'))!;
    // The guest's phone opens a second link (e.g. after its app was reopened) while the first is still up.
    const fresh = open('guest');
    await settle();
    expect(host.peers).toBe(1);
    // Now the old link goes away, late.
    guest.close();
    old.destroy();
    await settle();
    expect(host.peers).toBe(1);
    host.dispatch({ t: 'note', text: 'still here?' });
    await settle();
    expect(fresh.current?.log.at(-1)?.text).toBe('still here?');
  });

  it('a matchmaking-server hiccup doesn’t make a guest redial or drop its link (N5)', async () => {
    const { host, guest } = await battle();
    const gp = net.all.find((p) => p.id.startsWith('guest-'))!;
    expect(gp.dials).toBe(1);
    gp.serverDrop();
    await settle(30_000);
    expect(gp.destroyed).toBe(false);
    expect(gp.open).toBe(true);
    expect(gp.dials).toBe(1);
    expect(guest.status).toBe('online');
    host.dispatch({ t: 'note', text: 'after the hiccup' });
    await settle(60_000);
    expect(gp.dials).toBe(1);
    expect(guest.current?.log.at(-1)?.text).toBe('after the hiccup');
  });

  it('a host keeps its guests through a server hiccup and gets back on the server (N6)', async () => {
    const { host, guest } = await battle();
    const hp = net.peers.get('emperorslist-ROOM01')!;
    hp.serverDrop();
    await settle();
    expect(host.status).toBe('online');
    await settle(20_000);
    expect(hp.destroyed).toBe(false);
    expect(net.peers.get('emperorslist-ROOM01')).toBe(hp);
    expect(host.peers).toBe(1);
    expect(host.error).toBe('');
    guest.dispatch({ t: 'note', text: 'through the hiccup' });
    await settle();
    expect(host.current?.log.at(-1)?.text).toBe('through the hiccup');
  });

  it('keeps the room until every phone has the final result, then stops (N10)', async () => {
    const { host, guest } = await battle();
    host.dispatch({ t: 'end' });
    await settle();
    expect(guest.current?.stage).toBe('done');
    expect(host.resultCount).toEqual({ have: 2, of: 2 });
    await settle(5000);
    expect(host.status).toBe('asleep');
    expect(guest.status).toBe('asleep');
    await host.flush();
    expect(store.live('host').resultHave).toEqual(['g']);
    // Reopened later: the host has nothing left to share, so it doesn't open a room at all.
    host.close();
    const reopened = open('host');
    expect(reopened.status).toBe('asleep');
    // ...but reopening the game for everyone wakes it.
    reopened.dispatch({ t: 'reopen' });
    await settle(5000);
    expect(reopened.status).toBe('online');
  });

  it('a guest whose phone missed the end gets the result when both apps are open again (N10)', async () => {
    const { host, guest } = await battle();
    guest.close();
    host.dispatch({ t: 'end' });
    await settle();
    expect(host.resultCount).toEqual({ have: 1, of: 2 });
    await settle(5000);
    expect(host.status).toBe('online');
    const back = open('guest');
    await settle(5000);
    expect(back.current?.stage).toBe('done');
    expect(host.resultCount).toEqual({ have: 2, of: 2 });
  });

  it('another phone carries on as host; the others follow with their queued actions (N9)', async () => {
    const { host, guest } = await battle();
    // The host's battery dies.
    host.close();
    net.peers.get('emperorslist-ROOM01')?.destroy();
    await settle();
    guest.dispatch({ t: 'cpAdd', id: 'g', delta: 1 });
    await guest.flush();
    guest.close();
    const code = await continueAsHost('guest', deps);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(store.live('guest')).toMatchObject({ role: 'host', room: code, previousRoom: 'ROOM01' });
    expect(store.live('guest').state).toMatchObject({ hostId: 'g', room: code });
    expect(store.live('guest').state?.cp.g).toBe(2);
    const newHost = open('guest');
    await settle();
    expect(newHost.status).toBe('online');
    // The old host's phone comes back and follows the game into the new room, with a change it made alone.
    const h = store.live('host');
    store.games.set('host', { ...store.games.get('host')!, live: { ...h, role: 'guest', outbox: [{ seq: 1, at: 0, action: { t: 'cpAdd', id: 'h', delta: 2 } }] } as LiveSaved });
    expect(await moveToRoom('host', code!, deps)).toBe(true);
    const follower = open('host');
    await settle(5000);
    expect(follower.status).toBe('online');
    expect(newHost.current?.cp).toEqual({ h: 3, g: 2 });
    expect(follower.current?.cp).toEqual({ h: 3, g: 2 });
    expect(follower.current?.hostId).toBe('g');
  });
});
