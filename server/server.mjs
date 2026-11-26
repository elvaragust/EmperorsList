// EmperorsList server: serves the built app, relays live games between phones,
// and holds encrypted "move to this address" parcels for a short while.
//
// It stores no rules data and no readable player data:
//  - /relay        WebSocket. Phones in a live game talk through it. Nothing is kept.
//  - /api/transfer Encrypted blobs (the key never reaches the server), deleted after TRANSFER_TTL_H.
//  - everything else: the static app from STATIC_DIR, with the SPA fallback.
//
// Config (env): PORT, STATIC_DIR, DATA_DIR, ALLOWED_ORIGINS (comma list, for the relay and
// for transfer uploads from the old address), TRANSFER_MAX_MB, TRANSFER_TOTAL_MB, TRANSFER_TTL_H,
// TRUST_PROXY (only behind a proxy that overwrites X-Forwarded-For, e.g. Caddy).
import { createServer } from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? './dist');
const DATA_DIR = resolve(process.env.DATA_DIR ?? './data');
const TRANSFER_DIR = join(DATA_DIR, 'transfers');
const ALLOWED = new Set((process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const MB = 1024 * 1024;
const TRANSFER_MAX = Number(process.env.TRANSFER_MAX_MB ?? 40) * MB;
const TRANSFER_TOTAL = Number(process.env.TRANSFER_TOTAL_MB ?? 2048) * MB;
const TRANSFER_TTL = Number(process.env.TRANSFER_TTL_H ?? 48) * 3600 * 1000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const log = (...a) => console.log(new Date().toISOString(), ...a);
// One bad request must never take the server down for everyone.
process.on('uncaughtException', (e) => log('uncaught', e?.stack ?? e));
process.on('unhandledRejection', (e) => log('unhandled', e?.stack ?? e));

/** Same-origin requests are always fine; others only from ALLOWED_ORIGINS. */
function originOk(req, { required = false } = {}) {
  const o = req.headers.origin;
  if (!o) return !required;
  if (ALLOWED.has(o)) return true;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  try {
    return new URL(o).host === host;
  } catch {
    return false;
  }
}
const clientIp = (req) => (TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';

/** A tiny fixed-window rate limiter per key. */
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (key) => {
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    return n <= max;
  };
}

/** Stream a file to the response; a file that vanishes or a client that leaves never crashes anything. */
function streamFile(path, res) {
  pipeline(createReadStream(path), res, (err) => err && res.destroy());
}

// ---------------------------------------------------------------- static app

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

async function serveStatic(req, res, url) {
  const path = decodeURIComponent(url.pathname);
  const file = normalize(join(STATIC_DIR, path));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) return send(res, 400, 'Bad path');
  let target = file;
  let st = await stat(target).catch(() => undefined);
  if (st?.isDirectory()) {
    target = join(target, 'index.html');
    st = await stat(target).catch(() => undefined);
  }
  // Unknown paths are app routes (/lists/…, /play/join): serve the app. Missing assets stay 404.
  if (!st && !extname(path)) {
    target = join(STATIC_DIR, 'index.html');
    st = await stat(target).catch(() => undefined);
  }
  if (!st) return send(res, 404, 'Not found');
  const name = target.slice(STATIC_DIR.length);
  // Hashed build assets never change; the page, service worker and manifest must always be fresh.
  const cache = name.startsWith(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, ...SECURITY_HEADERS });
  if (req.method === 'HEAD') return res.end();
  streamFile(target, res);
}

function send(res, code, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(text);
}

// ---------------------------------------------------------------- transfers

const ID_RE = /^[a-f0-9]{16}$/;
const uploadLimit = limiter(4, 3600_000);
const downloadLimit = limiter(60, 3600_000);
let uploading = 0;
const MAX_UPLOADS = 3;
/** Bytes held in TRANSFER_DIR, kept up to date by uploads and the sweep. */
let stored = 0;

function cors(req) {
  const o = req.headers.origin;
  return o && originOk(req) ? { 'Access-Control-Allow-Origin': o, Vary: 'Origin' } : {};
}

/** Write the request body to a file, never holding it in memory. Resolves to its size; rejects (code 413) when too big. */
function receiveBody(req, tmp) {
  return new Promise((ok, fail) => {
    let size = 0;
    const out = createWriteStream(tmp, { mode: 0o600, flags: 'wx' });
    req.on('data', (c) => {
      size += c.length;
      if (size > TRANSFER_MAX) req.destroy(Object.assign(new Error('too big'), { code: 413 }));
    });
    pipeline(req, out, (err) => (err ? fail(size > TRANSFER_MAX ? Object.assign(new Error('too big'), { code: 413 }) : err) : ok(size)));
  });
}

async function transfer(req, res, url) {
  const id = url.pathname.slice('/api/transfer/'.length);
  if (req.method === 'OPTIONS') {
    return send(res, originOk(req) ? 204 : 403, '', { ...cors(req), 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
  }
  if (req.method === 'POST' && url.pathname === '/api/transfer') {
    // Browsers always send Origin on a POST from a page; requiring it keeps casual scripts out.
    if (!originOk(req, { required: true })) return send(res, 403, { error: 'origin' }, { Connection: 'close' });
    if (!uploadLimit(clientIp(req))) return send(res, 429, { error: 'Too many uploads, try again later.' }, { ...cors(req), Connection: 'close' });
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > TRANSFER_MAX) return send(res, 413, { error: 'Too big' }, { ...cors(req), Connection: 'close' });
    if (stored + (declared || TRANSFER_MAX) > TRANSFER_TOTAL || uploading >= MAX_UPLOADS) return send(res, 503, { error: 'The server is busy, try again in a while.' }, { ...cors(req), Connection: 'close', 'Retry-After': '600' });
    uploading++;
    const newId = randomBytes(8).toString('hex');
    const tmp = join(TRANSFER_DIR, `.${newId}.part`);
    try {
      const size = await receiveBody(req, tmp);
      if (size < 32) throw Object.assign(new Error('empty'), { code: 400 });
      await link(tmp, join(TRANSFER_DIR, newId)); // fails rather than overwrite
      stored += size;
      log('transfer stored', newId, size);
      return send(res, 201, { id: newId, expiresAt: Date.now() + TRANSFER_TTL }, cors(req));
    } catch (e) {
      const code = e?.code === 413 ? 413 : e?.code === 400 ? 400 : 500;
      if (!res.headersSent && !res.destroyed) send(res, code, { error: code === 413 ? 'Too big' : code === 400 ? 'Empty' : 'Upload failed' }, { ...cors(req), Connection: 'close' });
    } finally {
      uploading--;
      await rm(tmp, { force: true });
    }
    return;
  }
  if (req.method === 'GET' && ID_RE.test(id)) {
    if (!originOk(req)) return send(res, 403, { error: 'origin' });
    if (!downloadLimit(clientIp(req))) return send(res, 429, { error: 'Too many tries, try again later.' }, cors(req));
    const file = join(TRANSFER_DIR, id);
    const st = await stat(file).catch(() => undefined);
    if (!st || Date.now() - st.mtimeMs > TRANSFER_TTL) return send(res, 404, { error: 'Not found or expired' }, cors(req));
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...cors(req) });
    return streamFile(file, res);
  }
  return send(res, 404, { error: 'Not found' });
}

async function sweepTransfers() {
  let total = 0;
  for (const n of await readdir(TRANSFER_DIR).catch(() => [])) {
    const p = join(TRANSFER_DIR, n);
    const st = await stat(p).catch(() => undefined);
    if (!st) continue;
    // Expired parcels, and part files left by a crash (older than an hour).
    if (Date.now() - st.mtimeMs > (n.startsWith('.') ? 3600_000 : TRANSFER_TTL)) await rm(p, { force: true });
    else total += st.size;
  }
  stored = total;
}

// ---------------------------------------------------------------- relay
//
// A stand-in for the PeerJS server plus WebRTC: each phone opens one socket with an id
// (the host uses the room's id). Frames are JSON:
//   server -> client  {t:'open', id} | {t:'error', type, cid?} | {t:'connection', from, cid}
//                     {t:'conn-open', cid} | {t:'data', cid, d} | {t:'close', cid} | {t:'tick'} (every 10 s)
//   client -> server  {t:'connect', to, cid} | {t:'data', cid, d} | {t:'close', cid}
// An id is held by one live socket at a time; anyone else gets 'unavailable-id'. When that
// socket goes, the id stays reserved for its token for RESERVE_MS, so a host whose phone
// locked gets its room back and nobody else can take it over in the meantime.

const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
const CID_OK = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_FRAME = 256 * 1024; // a whole game state is a few tens of kB
const FRAME_BUDGET = 400; // frames per socket per 10 s
const BYTE_BUDGET = 4 * MB; // bytes per socket per 10 s
const MAX_BUFFERED = 2 * MB; // a socket that doesn't read what it's sent is dropped
const MAX_LINKS = 16; // per socket, either end (a 2v2 host has 3)
const MAX_SOCKETS_PER_IP = 30;
const RESERVE_MS = 60_000;
const sockets = new Map(); // id -> ws
const reserved = new Map(); // id -> { token, until }
const links = new Map(); // cid -> { a: ws (dialler), b: ws (answerer) }
const socketsPerIp = new Map();

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
function out(ws, msg) {
  if (ws.readyState !== ws.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFERED) return void ws.terminate();
  ws.send(JSON.stringify(msg));
}

function dropLinksOf(ws) {
  for (const cid of ws.cids) {
    const l = links.get(cid);
    if (!l) continue;
    links.delete(cid);
    const other = l.a === ws ? l.b : l.a;
    other.cids.delete(cid);
    out(other, { t: 'close', cid });
  }
  ws.cids.clear();
}

function takenFor(id, token) {
  const holder = sockets.get(id);
  if (holder && holder.readyState === holder.OPEN) return true;
  const r = reserved.get(id);
  return Boolean(r && r.until > Date.now() && r.token !== token);
}

wss.on('connection', (ws, req, id, token, ip) => {
  if (takenFor(id, token)) {
    out(ws, { t: 'error', type: 'unavailable-id' });
    ws.close(4001, 'id taken');
    return;
  }
  reserved.delete(id);
  ws.id = id;
  ws.cids = new Set();
  ws.alive = true;
  ws.frames = FRAME_BUDGET;
  ws.bytes = BYTE_BUDGET;
  sockets.set(id, ws);
  socketsPerIp.set(ip, (socketsPerIp.get(ip) ?? 0) + 1);
  out(ws, { t: 'open', id });

  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (raw, isBinary) => {
    ws.alive = true;
    ws.bytes -= raw.length;
    if (isBinary || --ws.frames < 0 || ws.bytes < 0) return;
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!m || typeof m.cid !== 'string' || !CID_OK.test(m.cid)) return;
    if (m.t === 'connect') {
      const target = typeof m.to === 'string' ? sockets.get(m.to) : undefined;
      if (!target || target === ws || target.readyState !== target.OPEN || links.has(m.cid) || ws.cids.size >= MAX_LINKS || target.cids.size >= MAX_LINKS) return out(ws, { t: 'error', type: 'peer-unavailable', cid: m.cid });
      links.set(m.cid, { a: ws, b: target });
      ws.cids.add(m.cid);
      target.cids.add(m.cid);
      out(target, { t: 'connection', from: ws.id, cid: m.cid });
      out(target, { t: 'conn-open', cid: m.cid });
      out(ws, { t: 'conn-open', cid: m.cid });
    } else if (m.t === 'data') {
      const l = links.get(m.cid);
      if (!l || (l.a !== ws && l.b !== ws)) return;
      out(l.a === ws ? l.b : l.a, { t: 'data', cid: m.cid, d: m.d });
    } else if (m.t === 'close') {
      const l = links.get(m.cid);
      if (!l || (l.a !== ws && l.b !== ws)) return;
      links.delete(m.cid);
      l.a.cids.delete(m.cid);
      l.b.cids.delete(m.cid);
      out(l.a === ws ? l.b : l.a, { t: 'close', cid: m.cid });
    }
  });
  ws.on('close', () => {
    socketsPerIp.set(ip, (socketsPerIp.get(ip) ?? 1) - 1);
    if (!socketsPerIp.get(ip)) socketsPerIp.delete(ip);
    if (sockets.get(id) === ws) {
      sockets.delete(id);
      reserved.set(id, { token, until: Date.now() + RESERVE_MS });
    }
    dropLinksOf(ws);
  });
  ws.on('error', () => undefined);
});

// Find sockets that died without closing (phone locked, network switched), refill budgets, forget old reservations.
setInterval(() => {
  for (const ws of wss.clients) {
    ws.frames = FRAME_BUDGET;
    ws.bytes = BYTE_BUDGET;
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
    // Browsers answer pings without telling the page; this tick lets the phone notice a dead socket too.
    out(ws, { t: 'tick' });
  }
  const now = Date.now();
  for (const [id, r] of reserved) if (r.until <= now) reserved.delete(id);
}, 10_000).unref();

// ---------------------------------------------------------------- http

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/healthz') return send(res, 200, { ok: true, sockets: sockets.size, links: links.size });
    if (url.pathname === '/api/transfer' || url.pathname.startsWith('/api/transfer/')) return await transfer(req, res, url);
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, url);
  } catch (e) {
    log('error', req.method, req.url, e?.message);
    const bad = e instanceof URIError || e instanceof TypeError;
    if (!res.headersSent) send(res, bad ? 400 : 500, bad ? 'Bad request' : 'Server error');
    else res.destroy();
  }
});

server.on('upgrade', (req, socket, head) => {
  const refuse = () => {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
  };
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const id = url.searchParams.get('id') ?? '';
    const token = url.searchParams.get('token') ?? '';
    const ip = clientIp(req);
    if (url.pathname !== '/relay' || !ID_OK.test(id) || token.length < 16 || token.length > 128 || !originOk(req) || (socketsPerIp.get(ip) ?? 0) >= MAX_SOCKETS_PER_IP) return refuse();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, id, token, ip));
  } catch {
    refuse();
  }
});
server.on('clientError', (_e, socket) => socket.destroy());

await mkdir(TRANSFER_DIR, { recursive: true });
await sweepTransfers();
setInterval(() => void sweepTransfers(), 600_000).unref();
server.listen(PORT, () => log(`EmperorsList server on :${PORT}, app from ${STATIC_DIR}, origins: ${[...ALLOWED].join(', ') || '(same origin only)'}`));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => server.close(() => process.exit(0)) && setTimeout(() => process.exit(0), 3000).unref());
