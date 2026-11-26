import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SavedGame } from '@/data/db';
import { LOCAL, newLiveState, reduce, type LivePlayer } from '@/engine/live';
import { Room, type LiveSaved, type RoomDeps } from '../room';
import { RelayPeer } from '../relay';

/* The real server and the real relay client, two rooms talking through it. Needs Node with WebSocket (22+). */
const PORT = 18000 + Math.floor(Math.random() * 1000);
const URL_ = `ws://127.0.0.1:${PORT}/relay`;
let server: ChildProcess;

const player = (id: string, name: string, team: 'A' | 'B'): LivePlayer => ({ id, name, team, army: 'x', faction: 'X', detachments: [] });
const H = player('h', 'Host', 'A');
const G = player('g', 'Guest', 'B');

const games = new Map<string, SavedGame>();
const deps: RoomDeps = {
  makePeer: async (id) => new RelayPeer(URL_, id),
  load: async (id) => structuredClone(games.get(id)),
  save: async (id, patch) => void games.set(id, { ...games.get(id)!, ...structuredClone(patch) }),
};
const wait = async (ok: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${ok.toString()}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe.skipIf(typeof WebSocket === 'undefined')('relay server', () => {
  beforeAll(async () => {
    server = spawn(process.execPath, ['server/server.mjs'], {
      env: { ...process.env, PORT: String(PORT), STATIC_DIR: 'public', DATA_DIR: mkdtempSync(join(tmpdir(), 'el-')) },
      stdio: 'pipe',
    });
    await new Promise<void>((res, rej) => {
      server.stdout!.on('data', (d) => String(d).includes('server on') && res());
      server.on('exit', (c) => rej(new Error(`server exited ${c}`)));
    });
  });
  afterAll(() => void server?.kill());

  it('carries a live game between two phones and notices a phone that hangs up', async () => {
    let s = newLiveState('RELAY1', H);
    s = reduce(s, { t: 'join', player: G }, 'g');
    s = reduce(s, { t: 'start' }, 'h');
    s = ['h', 'g'].reduce((st, id) => reduce(st, { t: 'cp', id, value: 1 }, LOCAL), s);
    games.set('host', { id: 'host', stage: 'battle', live: { room: 'RELAY1', role: 'host', myId: 'h', myName: 'Host', me: H, state: s } as LiveSaved } as unknown as SavedGame);
    games.set('guest', { id: 'guest', stage: 'battle', live: { room: 'RELAY1', role: 'guest', myId: 'g', myName: 'Guest', me: G, state: s } as LiveSaved } as unknown as SavedGame);
    const host = new Room('host', 'host', 'RELAY1', H, games.get('host')!.live as LiveSaved, deps);
    await wait(() => host.status === 'online');
    const guest = new Room('guest', 'guest', 'RELAY1', G, games.get('guest')!.live as LiveSaved, deps);
    await wait(() => guest.status === 'online' && host.peers === 1);

    guest.dispatch({ t: 'cpAdd', id: 'g', delta: 2 });
    await wait(() => host.current?.cp.g === 3);
    host.dispatch({ t: 'note', text: 'through the server' });
    await wait(() => guest.current?.log.at(-1)?.text === 'through the server');
    expect(guest.unsent).toBe(0);

    // A second tab trying to host the same room is refused while the first lives.
    const thief = new RelayPeer(URL_, 'emperorslist-RELAY1');
    const errs: string[] = [];
    thief.on('error', (e: { type: string }) => errs.push(e.type));
    await wait(() => errs.includes('unavailable-id'));
    thief.destroy();
    expect(host.status).toBe('online');

    // The guest's phone goes away: the server tells the host at once.
    guest.close();
    await wait(() => host.peers === 0);
    host.close();
  }, 30_000);

  it('a room whose host dropped is kept for that host, not handed to someone else', async () => {
    const as = (token: string) => new WebSocket(`${URL_}?id=emperorslist-KEEPME&token=${token}`);
    const first = (ws: WebSocket) => new Promise<{ t: string; type?: string }>((r) => (ws.onmessage = (e) => r(JSON.parse(String(e.data)))));
    const mine = 'a'.repeat(32);
    const host = as(mine);
    expect(await first(host)).toMatchObject({ t: 'open' });
    host.close();
    await new Promise((r) => setTimeout(r, 150));
    // Someone else tries to take the code while it's reserved for the host.
    expect(await first(as('z'.repeat(32)))).toMatchObject({ t: 'error', type: 'unavailable-id' });
    // The host itself gets it straight back.
    const back = as(mine);
    expect(await first(back)).toMatchObject({ t: 'open' });
    back.close();
  });

  it('a guest dialling a room nobody hosts is told so', async () => {
    const p = new RelayPeer(URL_);
    await new Promise<void>((r) => p.on('open', () => r()));
    const errs: string[] = [];
    p.on('error', (e: { type: string }) => errs.push(e.type));
    p.connect('emperorslist-NOBODY');
    await wait(() => errs.includes('peer-unavailable'));
    p.destroy();
  });
});
