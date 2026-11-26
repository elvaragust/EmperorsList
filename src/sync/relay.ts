import type { ConnLike, PeerLike } from './room';

/**
 * Live games through the EmperorsList server instead of WebRTC. One WebSocket
 * per phone carries every link; the server only forwards messages between
 * them and keeps nothing. It looks to the room exactly like a PeerJS peer, so
 * the room's rules (outbox, heartbeats, carrying on as host) are unchanged.
 *
 * Why: phone-to-phone links fail on many mobile networks and die silently when
 * a screen locks. A socket to the server goes through anything that loads a
 * web page, and the server notices a dead phone within seconds.
 */

type Handler = (...args: never[]) => void;
class Emitter {
  private handlers = new Map<string, Handler[]>();
  on(ev: string, fn: Handler) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]);
    return this;
  }
  protected emit(ev: string, ...args: unknown[]) {
    for (const f of this.handlers.get(ev) ?? []) (f as (...a: unknown[]) => void)(...args);
  }
}

type Frame =
  | { t: 'open'; id: string }
  | { t: 'error'; type: string; cid?: string }
  | { t: 'connection'; from: string; cid: string }
  | { t: 'conn-open'; cid: string }
  | { t: 'data'; cid: string; d: unknown }
  | { t: 'close'; cid: string }
  | { t: 'tick' };

/** The server sends something at least every 10 s; this long without a word means the socket is dead. */
export const RELAY_SILENT_MS = 25_000;

const rand = (n: number) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, n * 2);
};

const TOKEN_KEY = 'emperorslist.relayToken';
function deviceToken(): string {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t && t.length >= 16) return t;
    const fresh = rand(16);
    localStorage.setItem(TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return rand(16);
  }
}

class RelayConn extends Emitter implements ConnLike {
  open = false;
  closed = false;
  constructor(
    private owner: RelayPeer,
    readonly cid: string,
    readonly peer: string,
  ) {
    super();
  }
  send(d: unknown) {
    if (this.open) this.owner.frame({ t: 'data', cid: this.cid, d });
  }
  close() {
    if (this.closed) return;
    const was = this.open;
    this.owner.frame({ t: 'close', cid: this.cid });
    this.ended(was);
  }
  /** @internal */
  opened() {
    if (this.closed || this.open) return;
    this.open = true;
    this.emit('open');
  }
  /** @internal */
  received(d: unknown) {
    if (this.open) this.emit('data', d);
  }
  /** @internal */
  ended(wasOpen = this.open) {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.owner.forget(this.cid);
    if (wasOpen) queueMicrotask(() => this.emit('close'));
  }
}

export class RelayPeer extends Emitter implements PeerLike {
  open = false;
  destroyed = false;
  disconnected = false;
  private ws?: WebSocket;
  private conns = new Map<string, RelayConn>();
  /**
   * When this phone's socket goes, the server keeps its id (a room) for this token for a minute,
   * so the host gets its room back after a lock screen or reload and nobody else can take it.
   * Kept per device; a second tab is still refused while the first one's socket lives.
   */
  private readonly token = deviceToken();
  /** The server said our id is held by another tab or phone: the room handles that; the socket closing after it is no news. */
  private idTaken = false;
  private lastFrame = 0;
  private watch?: ReturnType<typeof setInterval>;

  constructor(
    private readonly url: string,
    readonly id: string = `p-${rand(8)}`,
  ) {
    super();
    this.dial();
  }

  private dial() {
    const u = new URL(this.url, typeof location === 'undefined' ? undefined : location.href);
    u.protocol = u.protocol === 'http:' ? 'ws:' : u.protocol === 'https:' ? 'wss:' : u.protocol;
    u.searchParams.set('id', this.id);
    u.searchParams.set('token', this.token);
    let ws: WebSocket;
    try {
      ws = new WebSocket(u);
    } catch {
      queueMicrotask(() => this.lost());
      return;
    }
    this.ws = ws;
    this.lastFrame = Date.now();
    clearInterval(this.watch);
    this.watch = setInterval(() => {
      if (ws !== this.ws || Date.now() - this.lastFrame <= RELAY_SILENT_MS) return;
      // The phone switched networks or slept: the browser may not notice for minutes.
      ws.close();
      this.lost();
    }, 5000);
    ws.onmessage = (ev) => {
      if (ws !== this.ws) return;
      this.lastFrame = Date.now();
      let f: Frame;
      try {
        f = JSON.parse(String(ev.data)) as Frame;
      } catch {
        return;
      }
      this.onFrame(f);
    };
    ws.onclose = () => ws === this.ws && this.lost();
    ws.onerror = () => undefined; // onclose follows
  }

  private onFrame(f: Frame) {
    if (f.t === 'open') {
      this.open = true;
      this.disconnected = false;
      this.emit('open', f.id);
    } else if (f.t === 'error') {
      if (f.cid) this.conns.get(f.cid)?.ended(false);
      if (f.type === 'unavailable-id') this.idTaken = true;
      this.emit('error', { type: f.type, message: f.type });
    } else if (f.t === 'connection') {
      const c = new RelayConn(this, f.cid, f.from);
      this.conns.set(f.cid, c);
      this.emit('connection', c);
    } else if (f.t === 'conn-open') this.conns.get(f.cid)?.opened();
    else if (f.t === 'data') this.conns.get(f.cid)?.received(f.d);
    else if (f.t === 'close') this.conns.get(f.cid)?.ended();
  }

  /** The socket is gone: every link went with it. */
  private lost() {
    if (this.destroyed) return;
    this.ws = undefined;
    clearInterval(this.watch);
    const wasOpen = this.open;
    this.open = false;
    this.disconnected = true;
    [...this.conns.values()].forEach((c) => c.ended());
    this.conns.clear();
    if (this.idTaken) return;
    this.emit('error', { type: wasOpen ? 'disconnected' : 'network', message: 'Lost the connection to the server' });
    this.emit('disconnected');
  }

  /** @internal */
  frame(f: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(f));
  }
  /** @internal */
  forget(cid: string) {
    this.conns.delete(cid);
  }

  connect(id: string): ConnLike {
    const c = new RelayConn(this, `${this.id}_${rand(6)}`, id);
    this.conns.set(c.cid, c);
    if (this.open) this.frame({ t: 'connect', to: id, cid: c.cid });
    else queueMicrotask(() => (c.ended(false), this.emit('error', { type: 'peer-unavailable' })));
    return c;
  }

  reconnect() {
    if (this.destroyed) throw new Error('destroyed');
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.idTaken = false;
    this.dial();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.open = false;
    clearInterval(this.watch);
    [...this.conns.values()].forEach((c) => c.close());
    const ws = this.ws;
    this.ws = undefined;
    ws?.close();
  }
}
