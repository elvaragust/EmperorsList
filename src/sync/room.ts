import { db, type SavedGame } from '@/data/db';
import { ackOf, makeRoomCode, mergeOffline, receive, reduce, takeOver, withPending, type LiveAction, type LivePlayer, type LiveState, type Pending } from '@/engine/live';

/**
 * Phone-to-phone rooms. The host's phone holds the game; others connect to it
 * directly (WebRTC data channels). A public PeerJS server only introduces the
 * phones to each other; game data goes straight between them and nothing is
 * stored on any server.
 *
 * Messages:
 *   guest -> host  { k: 'hello', player }        on connect (also on reconnect)
 *   guest -> host  { k: 'act', action, seq }     every action, numbered per player
 *   guest -> host  { k: 'have', v }              "I have the final result"
 *   host -> guests { k: 'state', state }         after every change
 *
 * A guest keeps every action it takes in an outbox (saved with the game, so a
 * reload keeps it) until the host has handled it (`state.acks`). The guest
 * shows the host's last copy with its outbox applied on top, so it can play on
 * while cut off. On every connect the outbox is sent again; the host runs each
 * action once, through the same rules as when online, so nothing that belongs
 * to another team is ever overwritten, CP and VP arrive as changes, and turn
 * moves from an older spot in the game are ignored.
 */
type Msg =
  | { k: 'hello'; player: LivePlayer }
  | { k: 'act'; action: LiveAction; from: string; seq?: number }
  /** Older phones: their whole copy after playing on while cut off, and the last copy they had from the host. */
  | { k: 'merge'; from: string; state: LiveState; base?: LiveState }
  | { k: 'state'; state: LiveState }
  | { k: 'have'; from: string; v: number }
  | { k: 'error'; message: string };

/** `asleep`: a finished game whose result every phone has, or one that stopped waiting for the others. */
export type RoomStatus = 'connecting' | 'online' | 'offline' | 'error' | 'asleep';

const PREFIX = 'emperorslist-';
const SERVER_KEY = 'emperorslist.peerServer';
/** Acted-on actions a guest keeps, to resend if another player carries on as host from an older copy. */
const KEEP_DONE = 100;
/** A finished game stops trying to reach the others after this long. */
export const DONE_WAIT_MS = 10 * 60 * 1000;
/** Results are offered to phones that haven't got them for this long after the game ends. */
export const RESULT_SHARE_MS = 24 * 60 * 60 * 1000;

/** Optional own PeerJS server, as "host:port/path" or a URL. Empty = the free public PeerJS server. */
export function peerServer(): string {
  try {
    return localStorage.getItem(SERVER_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setPeerServer(v: string) {
  try {
    if (v.trim()) localStorage.setItem(SERVER_KEY, v.trim());
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    /* ignore */
  }
}
function peerOptions(): Record<string, unknown> {
  const raw = peerServer();
  if (!raw) return { debug: 0 };
  const u = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
  return { debug: 0, host: u.hostname, port: Number(u.port) || (u.protocol === 'http:' ? 80 : 443), path: u.pathname || '/', secure: u.protocol === 'https:' };
}

/** The parts of a PeerJS data connection the room uses (a fake one in tests). */
export interface ConnLike {
  readonly peer: string;
  readonly open: boolean;
  on(ev: string, fn: (...args: never[]) => void): unknown;
  send(d: unknown): void;
  close(): void;
}
/** The parts of a PeerJS peer the room uses. */
export interface PeerLike {
  readonly open: boolean;
  readonly destroyed: boolean;
  readonly disconnected: boolean;
  on(ev: string, fn: (...args: never[]) => void): unknown;
  connect(id: string, opts?: { reliable?: boolean }): ConnLike;
  reconnect(): void;
  destroy(): void;
}
export interface RoomDeps {
  makePeer(id?: string): Promise<PeerLike>;
  load(gameId: string): Promise<SavedGame | undefined>;
  save(gameId: string, patch: Partial<SavedGame>): Promise<unknown>;
}
const defaultDeps: RoomDeps = {
  async makePeer(id) {
    const { default: Peer } = await import('peerjs');
    return (id ? new Peer(id, peerOptions()) : new Peer(peerOptions())) as unknown as PeerLike;
  },
  load: (id) => db.games.get(id),
  save: (id, patch) => db.games.update(id, patch),
};

/** What a live game keeps on this phone besides the shared state. */
export interface LiveSync {
  /** Guests: the last copy the host sent (`state` is this with the outbox applied). */
  base?: LiveState;
  /** Guests: actions taken here, until the host has handled them (and the last few after, see KEEP_DONE). */
  outbox?: Pending[];
  /** Guests: the last action number used. */
  seq?: number;
  /** Host: players whose phones have the final result. */
  resultHave?: string[];
  /** The room this game was in before someone carried on as host. */
  previousRoom?: string;
}
export type LiveSaved = NonNullable<SavedGame['live']> & LiveSync;
export const liveOf = (g: SavedGame | undefined): LiveSaved | undefined => g?.live as LiveSaved | undefined;

const rooms = new Map<string, Room>();
type Timer = ReturnType<typeof setTimeout>;

export class Room {
  status: RoomStatus = 'connecting';
  error = '';
  peers = 0;
  private peer?: PeerLike;
  private opening = false;
  /** Host: one link per player id (a phone that reconnects replaces its old link). */
  private conns = new Map<string, ConnLike>();
  /** Guest: the link to the host, while open or being dialled. */
  private hostConn?: ConnLike;
  private listeners = new Set<() => void>();
  private retry?: Timer;
  private dialTimer?: Timer;
  private giveUp?: Timer;
  private finishTimer?: Timer;
  private closed = false;
  private failures = 0;
  private idTakenSince = 0;
  /** Host: the game. Guest: what this phone shows (the host's copy plus our outbox). */
  private state?: LiveState;
  private base?: LiveState;
  private outbox: Pending[];
  private seq: number;
  private have: Set<string>;
  private saving: Promise<unknown> = Promise.resolve();
  private writeQueued = false;

  constructor(
    readonly gameId: string,
    readonly role: 'host' | 'guest',
    readonly room: string,
    readonly me: LivePlayer,
    live?: LiveSync & { state?: LiveState },
    private deps: RoomDeps = defaultDeps,
  ) {
    this.state = live?.state;
    this.base = role === 'guest' ? (live?.base ?? live?.state) : undefined;
    this.outbox = live?.outbox ?? [];
    this.seq = live?.seq ?? 0;
    this.have = new Set(live?.resultHave ?? []);
    if (role === 'host' && this.state?.stage === 'done' && this.everyoneHasResult()) this.status = 'asleep';
    else void this.open();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }
  private setStatus(s: RoomStatus, error = '') {
    const was = this.cutOff;
    this.status = s;
    this.error = error;
    // Cut off, a guest may change anything on its own copy; back online, the host's rules apply again.
    if (this.cutOff !== was) this.refresh();
    this.emit();
  }

  /** The shared state as this phone sees it. */
  get current(): LiveState | undefined {
    return this.state;
  }
  /** True while this guest is playing on its own copy (cut off from the host). */
  get cutOff(): boolean {
    return this.role === 'guest' && this.status !== 'online' && this.status !== 'asleep';
  }
  /** Guest: actions the host hasn't confirmed yet. */
  get unsent(): number {
    const done = ackOf(this.base, this.me.id);
    return this.outbox.filter((p) => p.seq > done).length;
  }
  /** Host of a finished game: how many phones (this one included) have the final result. */
  get resultCount(): { have: number; of: number } {
    const players = this.state?.players ?? [];
    return { have: players.filter((p) => p.id === this.me.id || this.have.has(p.id)).length, of: players.length };
  }

  // ----- connection -----
  private links(): boolean {
    return this.role === 'host' ? [...this.conns.values()].some((c) => c.open) : Boolean(this.hostConn?.open);
  }

  private async open() {
    if (this.closed || this.opening) return;
    this.opening = true;
    clearTimeout(this.retry);
    const old = this.peer;
    this.peer = undefined;
    this.dropHostConn();
    old?.destroy();
    if (!this.links()) this.setStatus('connecting', this.idTakenSince ? 'Reopening the room…' : '');
    let peer: PeerLike;
    try {
      peer = await this.deps.makePeer(this.role === 'host' ? PREFIX + this.room : undefined);
    } catch (e) {
      this.opening = false;
      this.setStatus('error', e instanceof Error ? e.message : String(e));
      return;
    }
    this.opening = false;
    if (this.closed) {
      peer.destroy();
      return;
    }
    this.peer = peer;
    this.startGiveUp();
    peer.on('open', () => {
      if (peer !== this.peer) return;
      this.failures = 0;
      this.idTakenSince = 0;
      clearTimeout(this.retry);
      if (this.role === 'host') this.setStatus('online');
      else if (this.hostConn?.open) this.setStatus('online');
      // A new server session doesn't mean a new link: only dial when there's none (open or being dialled).
      else this.connectToHost();
    });
    peer.on('connection', (conn: ConnLike) => peer === this.peer && this.role === 'host' && this.acceptGuest(conn));
    peer.on('disconnected', () => {
      // Lost the introduction server; links between phones keep working. Get back on it without dropping them.
      if (peer !== this.peer || this.closed) return;
      this.serverLost();
    });
    peer.on('error', (err: { type?: string; message?: string }) => {
      if (peer !== this.peer || this.closed) return;
      if (err.type === 'unavailable-id') {
        // Our room code is still taken on the server: usually our own previous connection, gone in a moment.
        this.idTakenSince ||= Date.now();
        if (Date.now() - this.idTakenSince < 30_000) this.setStatus('connecting', 'Reopening the room…');
        else this.setStatus('error', 'This room is open on another tab or phone. Close it there — this phone keeps trying.');
        this.scheduleRetry(5000);
      } else if (err.type === 'peer-unavailable') {
        this.dropHostConn();
        this.setStatus('offline', "Can't reach the host. Is their game open and online?");
        this.scheduleRetry(4000);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(err.type ?? '')) {
        this.serverLost();
      } else {
        this.setStatus('error', err.message ?? String(err.type));
        this.scheduleRetry(10_000);
      }
    });
  }

  /** The matchmaking server is gone for now: keep the phone-to-phone links and try to get back on. */
  private serverLost() {
    if (this.links()) this.setStatus('online', 'No connection to the matchmaking server — connected phones keep playing.');
    else this.setStatus('offline', this.role === 'guest' ? 'Lost the host. Reconnecting…' : 'No connection to the matchmaking server.');
    this.scheduleRetry(Math.min(30_000, 2000 * 2 ** this.failures));
  }

  private scheduleRetry(ms: number) {
    if (this.closed || this.status === 'asleep') return;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.tryAgain(), ms);
  }

  private tryAgain() {
    if (this.closed || this.status === 'asleep') return;
    const peer = this.peer;
    if (!peer || peer.destroyed) return void this.open();
    if (!peer.open) {
      // Back onto the server with the same peer, so the links stay up. Start afresh only when that keeps failing and there's nothing to lose.
      if (this.failures >= 3 && !this.links()) return void this.open();
      this.failures++;
      if (peer.disconnected) {
        try {
          peer.reconnect();
        } catch {
          return void this.open();
        }
      }
      this.scheduleRetry(Math.min(30_000, 2000 * 2 ** this.failures));
      return;
    }
    if (this.role === 'guest' && !this.hostConn) this.connectToHost();
  }

  /** A finished game doesn't keep trying forever. */
  private startGiveUp() {
    clearTimeout(this.giveUp);
    if (this.state?.stage !== 'done') return;
    this.giveUp = setTimeout(() => {
      if (this.state?.stage !== 'done') return;
      this.sleep('Stopped waiting for the other phones. Open this game again later to share the result.');
    }, DONE_WAIT_MS);
  }

  /** Hang up but keep the room, so it can wake again (a finished game). */
  private sleep(error = '') {
    clearTimeout(this.retry);
    clearTimeout(this.dialTimer);
    clearTimeout(this.giveUp);
    clearTimeout(this.finishTimer);
    this.dropHostConn();
    this.conns.forEach((c) => c.close());
    this.conns.clear();
    this.peers = 0;
    this.peer?.destroy();
    this.peer = undefined;
    this.setStatus('asleep', error);
  }

  /** Try to reach the others again (after a finished game went quiet, or by hand). */
  wake() {
    if (this.closed) return;
    if (this.status === 'asleep') this.status = 'connecting';
    this.failures = 0;
    if (!this.peer || this.peer.destroyed) void this.open();
    else this.tryAgain();
  }

  // ----- guest -----
  private dropHostConn() {
    const c = this.hostConn;
    this.hostConn = undefined;
    clearTimeout(this.dialTimer);
    c?.close();
  }

  private connectToHost() {
    if (!this.peer || this.closed || this.peer.destroyed || this.role !== 'guest') return;
    // Never redial a link that is open or still being dialled: closing it would only start another round of retries.
    if (this.hostConn) return;
    const conn = this.peer.connect(PREFIX + this.room, { reliable: true });
    this.hostConn = conn;
    clearTimeout(this.dialTimer);
    this.dialTimer = setTimeout(() => {
      if (conn !== this.hostConn || conn.open) return;
      this.dropHostConn();
      this.scheduleRetry(1000);
    }, 10_000);
    conn.on('open', () => {
      if (conn !== this.hostConn) return;
      clearTimeout(this.dialTimer);
      clearTimeout(this.retry);
      this.setStatus('online');
      this.refresh();
      conn.send({ k: 'hello', player: this.me } satisfies Msg);
      // Always send what the host may not have handled yet; it skips anything it has.
      for (const p of this.outbox) conn.send({ k: 'act', action: p.action, from: this.me.id, seq: p.seq } satisfies Msg);
    });
    conn.on('data', (d: unknown) => conn === this.hostConn && this.onGuestMessage(d as Msg, conn));
    const lost = () => {
      // A link we replaced or hung up on ourselves says nothing about the current one.
      if (conn !== this.hostConn || this.closed) return;
      this.dropHostConn();
      if (this.status === 'asleep') return;
      this.setStatus('offline', 'Lost the host. Reconnecting…');
      this.refresh();
      this.scheduleRetry(3000);
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  private onGuestMessage(m: Msg, conn: ConnLike) {
    if (m.k === 'state') {
      // Everything on the current link comes from the host as it is now; no comparing numbers with our own copy.
      this.base = m.state;
      const done = ackOf(m.state, this.me.id);
      const kept = this.outbox.filter((p) => p.seq <= done).slice(-KEEP_DONE);
      this.outbox = [...kept, ...this.outbox.filter((p) => p.seq > done)];
      this.refresh();
      if (m.state.stage === 'done') {
        conn.send({ k: 'have', from: this.me.id, v: m.state.v } satisfies Msg);
        this.startGiveUp();
        // Got the result: nothing more to wait for once everything we did is in.
        clearTimeout(this.finishTimer);
        if (!this.unsent) this.finishTimer = setTimeout(() => this.state?.stage === 'done' && !this.unsent && this.sleep(), 3000);
      } else {
        clearTimeout(this.finishTimer);
        clearTimeout(this.giveUp);
      }
    } else if (m.k === 'error') this.setStatus('error', m.message);
  }

  /** Recompute what this guest shows and save it. */
  private refresh() {
    if (this.role !== 'guest' || !this.base) return;
    this.state = withPending(this.base, this.outbox, this.me.id, this.cutOff);
    this.persist();
  }

  // ----- host -----
  private acceptGuest(conn: ConnLike) {
    let id: string | undefined;
    conn.on('open', () => {
      if (this.state) conn.send({ k: 'state', state: this.state } satisfies Msg);
    });
    conn.on('data', (d: unknown) => {
      const m = d as Msg;
      if (m.k === 'hello') {
        id = m.player.id;
        const old = this.conns.get(id);
        this.conns.set(id, conn);
        if (old && old !== conn) old.close();
        this.peers = this.conns.size;
        this.emit();
        // Always answer with the game, even when the hello changes nothing.
        if (!this.apply({ t: 'join', player: m.player }, id, conn) && this.state) conn.send({ k: 'state', state: this.state } satisfies Msg);
      } else if (m.k === 'act') {
        const from = id ?? m.from;
        if (m.action.t === 'join' && m.action.player.id !== from) return;
        this.apply(m.action, from, conn, m.seq);
      } else if (m.k === 'merge' && this.state) {
        this.publish(mergeOffline(this.state, m.state, m.base, id ?? m.from));
      } else if (m.k === 'have' && this.state?.stage === 'done') {
        this.have.add(id ?? m.from);
        this.persist();
        this.emit();
        this.maybeFinish();
      }
    });
    conn.on('close', () => {
      // Only forget the link if it is still this player's current one (a reconnect may have replaced it).
      if (!id || this.conns.get(id) !== conn) return;
      this.conns.delete(id);
      this.peers = this.conns.size;
      this.emit();
    });
  }

  /** Run an action through the rules; true if the game changed. */
  private apply(action: LiveAction, from: string, origin?: ConnLike, seq?: number): boolean {
    if (!this.state) return false;
    const before = this.state;
    const next = from === this.me.id ? reduce(before, action, from) : receive(before, action, from, seq);
    if (next === before) {
      if (action.t === 'join' && origin && !before.players.some((p) => p.id === action.player.id)) {
        origin.send({ k: 'error', message: before.stage !== 'lobby' ? 'This game has already started.' : 'This room is full.' } satisfies Msg);
      }
      // A resent action we already have: tell the phone, so it stops sending it.
      if (seq !== undefined && origin) origin.send({ k: 'state', state: before } satisfies Msg);
      return false;
    }
    this.publish(next);
    return true;
  }

  private publish(next: LiveState) {
    if (next === this.state) return;
    const wasDone = this.state?.stage === 'done';
    this.state = next;
    if (next.stage !== 'done') this.have.clear();
    if (this.status === 'asleep' && next.stage !== 'done') this.wake();
    if (next.stage === 'done' && !wasDone) this.startGiveUp();
    else if (next.stage !== 'done') clearTimeout(this.giveUp);
    this.persist();
    this.conns.forEach((c) => c.open && c.send({ k: 'state', state: next } satisfies Msg));
    this.maybeFinish();
  }

  private everyoneHasResult(): boolean {
    const r = this.resultCount;
    return r.of > 0 && r.have >= r.of;
  }

  /** Host: when every phone has the final result, hang up (after a moment, so the last messages get through). */
  private maybeFinish() {
    clearTimeout(this.finishTimer);
    if (this.role !== 'host' || this.state?.stage !== 'done' || !this.everyoneHasResult()) return;
    this.finishTimer = setTimeout(() => this.state?.stage === 'done' && this.sleep(), 3000);
  }

  // ----- both -----
  dispatch(action: LiveAction) {
    if (this.closed) return;
    if (this.role === 'host') {
      this.apply(action, this.me.id);
      return;
    }
    // Number it and keep it until the host has handled it; show it straight away.
    const last = this.outbox.at(-1)?.seq ?? 0;
    this.seq = Math.max(this.seq, last, ackOf(this.base, this.me.id)) + 1;
    const p: Pending = { seq: this.seq, action, at: Date.now() };
    this.outbox = [...this.outbox, p];
    this.refresh();
    if (this.hostConn?.open) this.hostConn.send({ k: 'act', action, from: this.me.id, seq: p.seq } satisfies Msg);
    else if (this.status === 'asleep') this.wake();
  }

  /** Save this phone's copy (one write at a time, always the latest). */
  private persist() {
    if (this.writeQueued) return;
    this.writeQueued = true;
    this.saving = this.saving
      .then(async () => {
        this.writeQueued = false;
        await this.write();
      })
      .catch(() => undefined);
  }

  /** Wait for saves in flight (tests). */
  flush(): Promise<unknown> {
    return this.saving;
  }

  private async write() {
    const state = this.state;
    if (!state || this.closed) return;
    const g = await this.deps.load(this.gameId);
    if (this.closed) return;
    if (g?.live?.unlinked) {
      // The player turned live changes off: don't overwrite their copy.
      this.close();
      return;
    }
    if (g?.live) {
      const live: LiveSaved = { ...g.live, state };
      if (this.role === 'guest') Object.assign(live, { base: this.base, outbox: this.outbox, seq: this.seq } satisfies LiveSync);
      else live.resultHave = [...this.have];
      const update: Partial<SavedGame> = { live };
      // Mirror the shared turn into the local game so lists show the right round.
      update.round = state.round;
      update.stage = state.stage === 'lobby' ? 'setup' : state.stage;
      const mine = state.players.find((p) => p.id === this.me.id)?.primary;
      if (mine || state.mission) update.mission = mine ?? state.mission;
      if (state.stage === 'done') {
        const myTeam = state.players.find((p) => p.id === this.me.id)?.team;
        // Corrected on this phone's result screen: that view decides the result here.
        if (!g.scoreEdits) update.result = state.winner === 'draw' ? 'draw' : state.winner === myTeam ? 'win' : 'loss';
        update.finishedAt = g.finishedAt ?? Date.now();
      }
      await this.deps.save(this.gameId, update);
    }
    this.emit();
  }

  close() {
    this.closed = true;
    clearTimeout(this.retry);
    clearTimeout(this.dialTimer);
    clearTimeout(this.giveUp);
    clearTimeout(this.finishTimer);
    this.dropHostConn();
    this.conns.forEach((c) => c.close());
    this.peer?.destroy();
    if (rooms.get(this.gameId) === this) rooms.delete(this.gameId);
  }
}

/** One room per live game, kept open while the app runs (moving between screens doesn't drop it). */
export function roomFor(game: SavedGame): Room | undefined {
  const live = liveOf(game);
  if (!live || live.unlinked) return undefined;
  let r = rooms.get(game.id);
  if (r && (r.room !== live.room || r.role !== live.role)) {
    // Carried on as host, or moved to another room: the old room is done with.
    r.close();
    r = undefined;
  }
  if (!r) {
    r = new Room(game.id, live.role, live.room, live.me, live);
    rooms.set(game.id, r);
  }
  return r;
}

export function closeRoom(gameId: string) {
  rooms.get(gameId)?.close();
}

/**
 * Apply actions to a game that isn't linked to the others (an offline copy):
 * all in one go on the latest saved copy, so two changes from one tap never
 * overwrite each other. Anything may be changed; CP spent comes out of your own pool.
 */
export async function applyUnlinked(gameId: string, actions: LiveAction[]) {
  await db.transaction('rw', db.games, async () => {
    const g = await db.games.get(gameId);
    const state = g?.live?.state;
    if (!g?.live || !state) return;
    const myId = g.live.myId;
    const next = actions.reduce((s, a) => reduce(s, a, myId, { local: true }), state);
    if (next === state) return;
    const myTeam = next.players.find((p) => p.id === myId)?.team;
    await db.games.update(gameId, {
      live: { ...g.live, state: next },
      round: next.round,
      stage: next.stage === 'lobby' ? 'setup' : next.stage,
      result: next.stage === 'done' ? (next.winner === 'draw' ? 'draw' : next.winner === myTeam ? 'win' : 'loss') : g.result,
    });
  });
}

/**
 * The host's phone is gone: this phone carries on as host with the latest copy
 * it has (and its own actions the host never got), under a new room code the
 * others join. Returns the new code.
 */
export async function continueAsHost(gameId: string, deps: Pick<RoomDeps, 'load' | 'save'> = defaultDeps): Promise<string | undefined> {
  // Hang up first and let the last save land, so the copy below is the latest and nothing writes over it.
  await hangUp(gameId);
  const g = await deps.load(gameId);
  const live = liveOf(g);
  const base = live?.base ?? live?.state;
  if (!live || !base) return undefined;
  const room = makeRoomCode();
  const state = takeOver(base, live.outbox ?? [], live.myId, room);
  const next: LiveSaved = { ...live, room, role: 'host', state, base: undefined, outbox: undefined, seq: undefined, resultHave: undefined, previousRoom: live.room, unlinked: false };
  await deps.save(gameId, { live: next, round: state.round });
  return room;
}

/**
 * Someone else carried on as host: follow the game to their new room. Our own
 * actions are sent again there; the new host skips any it already has.
 */
export async function moveToRoom(gameId: string, room: string, deps: Pick<RoomDeps, 'load' | 'save'> = defaultDeps): Promise<boolean> {
  const code = room.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code) || code === liveOf(await deps.load(gameId))?.room) return false;
  await hangUp(gameId);
  const live = liveOf(await deps.load(gameId));
  if (!live) return false;
  const next: LiveSaved = { ...live, room: code, role: 'guest', base: live.base ?? live.state, outbox: live.outbox ?? [], previousRoom: live.room, unlinked: false };
  await deps.save(gameId, { live: next });
  return true;
}

async function hangUp(gameId: string) {
  const r = rooms.get(gameId);
  r?.close();
  await r?.flush();
}

/** Unfinished live games on this phone that could follow their game into another room. */
export const movableGames = (games: SavedGame[], room: string) => games.filter((g) => g.live?.state && g.stage !== 'done' && !g.idle && g.live.room !== room.toUpperCase());

/**
 * Hosts of games that ended recently reopen the room while the app runs, until
 * every phone has the final result (a phone that was asleep at the end gets it
 * the next time both apps are open).
 */
export function shareResults(games: SavedGame[], now = Date.now()) {
  for (const g of games) {
    const live = liveOf(g);
    if (!live || live.unlinked || live.role !== 'host' || g.idle || live.state?.stage !== 'done') continue;
    if (now - (g.finishedAt ?? now) > RESULT_SHARE_MS) continue;
    const have = new Set(live.resultHave ?? []);
    if (live.state.players.every((p) => p.id === live.myId || have.has(p.id))) continue;
    roomFor(g);
  }
}

export const joinUrl = (room: string) => `${location.origin}${import.meta.env.BASE_URL}play/join#${room}`;
