import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { db } from '@/data/db';

/**
 * App updates never reload the page by themselves. A new version waits until
 * the player taps Reload, or is put in quietly when the app starts cold with
 * nothing in progress. During a game or a wizard it waits for the next start.
 */

let ready = false;
let apply: ((reload?: boolean) => Promise<void>) | undefined;
const listeners = new Set<() => void>();
const startedAt = Date.now();
/** An update found this soon after the app opened counts as found on a cold start. */
const COLD_START_MS = 10_000;

const setReady = () => {
  ready = true;
  listeners.forEach((l) => l());
};

/** Screens where a reload would lose what is being entered or interrupt play (paths inside the app, without the base). */
export function busyPath(path: string): boolean {
  return /^\/(new|import)\/?$/.test(path) || /^\/play\/(new|join)\/?$/.test(path) || /^\/roster\/[^/]+\/play\/?$/.test(path);
}

/** The game id when a game screen is open (not the new/join/layouts screens). */
export function openGameId(path: string): string | undefined {
  const id = path.match(/^\/play\/([^/]+)/)?.[1];
  return id && !['new', 'join', 'layouts'].includes(id) ? id : undefined;
}

/** A battle in progress (on any screen), or a game, list or setup wizard open on this one. */
export async function busyNow(path: string): Promise<boolean> {
  if (busyPath(path)) return true;
  const id = openGameId(path);
  if (id) {
    const g = await db.games.get(id);
    if (g && g.stage !== 'done') return true;
  }
  return (await db.games.filter((g) => g.stage === 'battle' && !g.practice).count()) > 0;
}

const appPath = () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const p = location.pathname;
  return (p.startsWith(base) ? p.slice(base.length) : p) || '/';
};

/** Register the service worker and look for new versions on start, on return to the app and every 30 minutes. */
export function startUpdates() {
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (Date.now() - startedAt > COLD_START_MS) return setReady();
      // Cold start: put the new version in straight away unless something is in progress.
      busyNow(appPath())
        .then((busy) => (busy ? setReady() : apply?.(true)))
        .catch(setReady);
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => void reg.update().catch(() => undefined);
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });
}

/** Switch to the new version now (the page reloads). */
export const applyUpdate = () => void apply?.(true);

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => ready,
  );
}
