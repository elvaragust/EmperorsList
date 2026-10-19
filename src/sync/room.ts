import type { DataConnection, Peer as PeerType } from 'peerjs';
import { db, type SavedGame } from '@/data/db';
import { LOCAL, mergeOffline, reduce, type LiveAction, type LivePlayer, type LiveState } from '@/engine/live';

/**
 * Phone-to-phone rooms. The host's phone holds the game; others connect to it
 * directly (WebRTC data channels). A public PeerJS server only introduces the
 * phones to each other; game data goes straight between them and nothing is
 * stored on any server.
 *
 * Messages:
 *   guest -> host  { k: 'hello', player }   on connect (also on reconnect)
 *   guest -> host  { k: 'act', action }
 *   guest -> host  { k: 'merge', state, base } after playing on while cut off
 *   host -> guests { k: 'state', state }    after every change
 *
 * A guest that loses the host keeps playing: its actions apply to its own
 * copy straight away (anything may be changed). When the host is back, that
 * copy is sent once and the host folds in only the guest's own team's changes
 * (see `mergeOffline`); everything else comes from the host.
 */
type Msg =
  | { k: 'hello'; player: LivePlayer }
  | { k: 'act'; action: LiveAction; from: string }
  /** A guest that played on while cut off: its copy, and the last copy it had from the host. */
  | { k: 'merge'; from: string; state: LiveState; base?: LiveState }
  | { k: 'state'; state: LiveState }
  | { k: 'error'; message: string };

export type RoomStatus = 'connecting' | 'online' | 'offline' | 'error';

const PREFIX = 'emperorslist-';
const SERVER_KEY = 'emperorslist.peerServer';

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
const rooms = new Map<string, Room>();

export class Room {
  status: RoomStatus = 'connecting';
  error = '';
  peers = 0;
  private peer?: PeerType;
  private conns = new Map<string, DataConnection>();
  private hostConn?: DataConnection;
  private listeners = new Set<() => void>();
  private retry?: ReturnType<typeof setTimeout>;
  private closed = false;
  private state?: LiveState;
  /** The last copy the host sent (guests), and whether we've changed our copy since without the host. */
  private hostState?: LiveState;
  private offlineChanges = false;

  constructor(
    readonly gameId: string,
    readonly role: 'host' | 'guest',
    readonly room: string,
    readonly me: LivePlayer,
    initial?: LiveState,
  ) {
    this.state = initial;
    this.hostState = initial;
    void this.open();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }
  private setStatus(s: RoomStatus, error = '') {
    this.status = s;
    this.error = error;
    this.emit();
  }

  private async open() {
    const { default: Peer } = await import('peerjs');
    if (this.closed) return;
    this.peer?.destroy();
    this.setStatus('connecting');
    const peer = this.role === 'host' ? new Peer(PREFIX + this.room, peerOptions()) : new Peer(peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      if (this.role === 'host') {
        this.setStatus('online');
      } else this.connectToHost();
    });
    peer.on('connection', (conn) => this.role === 'host' && this.acceptGuest(conn));
    peer.on('disconnected', () => {
      // Lost the introduction server; existing phone-to-phone links keep working.
      if (!this.closed) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on('error', (err: { type?: string; message?: string }) => {
      if (err.type === 'unavailable-id') {
        // Another tab or phone is already hosting this room; try again shortly (it may be our own old tab closing).
        this.setStatus('error', 'This room is already open on another tab or phone. Close it there, or wait a moment.');
        this.scheduleRetry(5000);
      } else if (err.type === 'peer-unavailable') {
        this.setStatus('offline', "Can't reach the host. Is their game open and online?");
        this.scheduleRetry(4000);
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
        this.setStatus('offline', 'No connection to the matchmaking server.');
        this.scheduleRetry(5000);
      } else {
        this.setStatus('error', err.message ?? String(err.type));
      }
    });
  }

  private scheduleRetry(ms: number) {
    if (this.closed) return;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      if (this.role === 'guest' && this.peer && !this.peer.destroyed && this.peer.open) this.connectToHost();
      else void this.open();
    }, ms);
  }

  // ----- guest -----
  private connectToHost() {
    if (!this.peer || this.closed) return;
    this.hostConn?.close();
    const conn = this.peer.connect(PREFIX + this.room, { reliable: true });
    this.hostConn = conn;
    conn.on('open', () => {
      this.setStatus('online');
      conn.send({ k: 'hello', player: this.me } satisfies Msg);
      // Played on while cut off: hand our copy to the host to fold in.
      if (this.offlineChanges && this.state) {
        conn.send({ k: 'merge', from: this.me.id, state: this.state, base: this.hostState } satisfies Msg);
        this.offlineChanges = false;
      }
    });
    conn.on('data', (d) => this.onGuestMessage(d as Msg));
    conn.on('close', () => {
      if (this.closed) return;
      this.setStatus('offline', 'Lost the host. Reconnecting…');
      this.scheduleRetry(3000);
    });
    conn.on('error', () => this.scheduleRetry(3000));
  }

  private onGuestMessage(m: Msg) {
    if (m.k === 'state') {
      // Compare with the host's own numbering: our offline copy may have counted further.
      if (this.offlineChanges) return;
      if (!this.hostState || m.state.v >= this.hostState.v || m.state.room !== this.hostState.room) {
        this.hostState = m.state;
        void this.persist(m.state);
      }
    } else if (m.k === 'error') this.setStatus('error', m.message);
  }

  // ----- host -----
  private acceptGuest(conn: DataConnection) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      this.peers = this.conns.size;
      this.emit();
      if (this.state) conn.send({ k: 'state', state: this.state } satisfies Msg);
    });
    conn.on('data', (d) => {
      const m = d as Msg;
      if (m.k === 'hello') this.apply({ t: 'join', player: m.player }, m.player.id, conn);
      else if (m.k === 'act') this.apply(m.action, m.from, conn);
      else if (m.k === 'merge' && this.state) this.publish(mergeOffline(this.state, m.state, m.base, m.from));
    });
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      this.peers = this.conns.size;
      this.emit();
    });
  }

  private apply(action: LiveAction, from: string, origin?: DataConnection) {
    if (!this.state) return;
    const before = this.state;
    const next = reduce(before, action, from);
    if (next === before) {
      if (action.t === 'join' && origin) {
        origin.send({ k: 'error', message: before.stage !== 'lobby' ? 'This game has already started.' : 'This room is full.' } satisfies Msg);
      }
      return;
    }
    this.publish(next);
  }

  private publish(next: LiveState) {
    if (next === this.state) return;
    void this.persist(next);
    this.conns.forEach((c) => c.open && c.send({ k: 'state', state: next } satisfies Msg));
  }

  // ----- both -----
  dispatch(action: LiveAction) {
    if (this.role === 'host') return this.apply(action, this.me.id);
    if (this.hostConn?.open && this.status === 'online' && !this.offlineChanges) {
      this.hostConn.send({ k: 'act', action, from: this.me.id } satisfies Msg);
      return;
    }
    // Cut off from the host: keep playing on our own copy; it's merged when the host is back.
    if (!this.state) return;
    const next = reduce(this.state, action, LOCAL);
    if (next === this.state) return;
    this.offlineChanges = true;
    void this.persist(next);
  }

  /** True while this guest is playing on its own copy (cut off from the host). */
  get cutOff(): boolean {
    return this.role === 'guest' && this.status !== 'online';
  }

  private async persist(state: LiveState) {
    this.state = state;
    const g = await db.games.get(this.gameId);
    if (g?.live?.unlinked) {
      // The player turned live changes off: don't overwrite their copy.
      this.close();
      return;
    }
    if (g?.live) {
      const update: Partial<SavedGame> = { live: { ...g.live, state } };
      // Mirror the shared turn into the local game so lists show the right round.
      update.round = state.round;
      update.stage = state.stage === 'lobby' ? 'setup' : state.stage;
      const mine = state.players.find((p) => p.id === this.me.id)?.primary;
      if (mine || state.mission) update.mission = mine ?? state.mission;
      if (state.stage === 'done') {
        const myTeam = state.players.find((p) => p.id === this.me.id)?.team;
        update.result = state.winner === 'draw' ? 'draw' : state.winner === myTeam ? 'win' : 'loss';
        update.finishedAt = g.finishedAt ?? Date.now();
      }
      await db.games.update(this.gameId, update);
    }
    this.emit();
  }

  close() {
    this.closed = true;
    clearTimeout(this.retry);
    this.hostConn?.close();
    this.conns.forEach((c) => c.close());
    this.peer?.destroy();
    rooms.delete(this.gameId);
  }
}

/** One room per live game, kept open while the app runs (moving between screens doesn't drop it). */
export function roomFor(game: SavedGame): Room | undefined {
  if (!game.live || game.live.unlinked) return undefined;
  let r = rooms.get(game.id);
  if (!r) {
    const me = game.live.me;
    r = new Room(game.id, game.live.role, game.live.room, me, game.live.state);
    rooms.set(game.id, r);
  }
  return r;
}

export function closeRoom(gameId: string) {
  rooms.get(gameId)?.close();
}

export const joinUrl = (room: string) => `${location.origin}${import.meta.env.BASE_URL}play/join#${room}`;
