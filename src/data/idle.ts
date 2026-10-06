import { db, type SavedGame } from './db';
import { closeRoom } from '@/sync/room';

/** Games with no changes for this long are ended automatically (and can be resumed). */
export const IDLE_MS = 2 * 60 * 60 * 1000;

export function lastActive(g: SavedGame): number {
  return Math.max(g.lastActiveAt ?? 0, g.startedAt, g.log.at(-1)?.at ?? 0);
}

/** End every unfinished game that has been quiet for two hours. Returns how many were ended. */
export async function endIdleGames(now = Date.now()): Promise<number> {
  const games = await db.games.toArray();
  let n = 0;
  for (const g of games) {
    if (g.stage === 'done' || g.idle) continue;
    if (now - lastActive(g) < IDLE_MS) continue;
    const idle: SavedGame['idle'] = { at: now, stage: g.stage, unlinked: g.live?.unlinked };
    // Hang up a live game first so the room can't write over the ended copy.
    await db.games.update(g.id, { idle, stage: 'done', ...(g.live ? { live: { ...g.live, unlinked: true } } : {}) });
    if (g.live) closeRoom(g.id);
    n++;
  }
  return n;
}

/** Pick an idle-ended game back up where it stopped (live games reconnect). */
export async function resumeGame(g: SavedGame) {
  if (!g.idle) return;
  await db.games.update(g.id, {
    idle: undefined,
    lastActiveAt: Date.now(),
    stage: g.idle.stage,
    ...(g.live ? { live: { ...g.live, unlinked: Boolean(g.idle.unlinked) } } : {}),
  });
}

/** Keep the game as finished: forget that it could be resumed. */
export async function keepEnded(g: SavedGame) {
  await db.games.update(g.id, { idle: undefined, finishedAt: g.finishedAt ?? g.idle?.at ?? Date.now() });
}

/** Check now, every minute, and whenever the app comes back to the screen. */
export function watchIdleGames(): () => void {
  const run = () => void endIdleGames().catch(() => undefined);
  run();
  const t = setInterval(run, 60_000);
  const vis = () => document.visibilityState === 'visible' && run();
  document.addEventListener('visibilitychange', vis);
  return () => {
    clearInterval(t);
    document.removeEventListener('visibilitychange', vis);
  };
}
