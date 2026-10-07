import { useSyncExternalStore } from 'react';
import { coreSectionsToRules, importWahapedia, missionCardsToRules, type CoreSection, type MissionCard, type WahapediaFiles } from '@/engine/wahapedia';
import { setCoreSections } from '@/engine/rules/glossary';
import { db } from './db';
import { currentSource, fetchDataFile, sourceState } from './dataPacks';
import { clearIndexCache } from './gameData';

/**
 * Startup sync: every faction from the data repo is downloaded in the
 * background (once, then only changed files), and the Wahapedia extras that
 * ship with the site are imported. The app works while this runs.
 */
export interface SyncStatus {
  running: boolean;
  done: number;
  total: number;
  current?: string;
  error?: string;
  finishedAt?: number;
}

let status: SyncStatus = { running: false, done: 0, total: 0 };
const listeners = new Set<() => void>();
const set = (s: Partial<SyncStatus>) => {
  status = { ...status, ...s };
  listeners.forEach((l) => l());
};
export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
  );

const CHECK_KEY = 'emperorslist.lastDataCheck';
const DAY = 24 * 60 * 60 * 1000;

function lastCheck(): number {
  try {
    return Number(localStorage.getItem(CHECK_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/** Download every data file that is missing or out of date. */
export async function syncAllFactions(force = false): Promise<void> {
  if (status.running) return;
  set({ running: true, done: 0, total: 0, error: undefined, current: 'Checking for game data…' });
  try {
    const refresh = force || Date.now() - lastCheck() > DAY;
    const state = await sourceState(refresh);
    try {
      localStorage.setItem(CHECK_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    // Only metadata is read here — never the files themselves (tens of MB on a phone).
    const cached = new Map((await db.dataMeta.toArray()).map((f) => [f.path, f]));
    const shas = state.shas ?? {};
    // A new commit usually changes one or two files: compare each file's own id, not the commit.
    const todo = state.files.filter((p) => {
      const m = cached.get(p);
      if (!m) return true;
      // Files cached before ids were kept: up to date if they're from this commit.
      return shas[p] && m.sha ? m.sha !== shas[p] : m.commit !== state.commit;
    });
    // Unchanged files: just note the new commit (no download).
    const same = [...cached.values()].filter((m) => !todo.includes(m.path) && shas[m.path] && (m.commit !== state.commit || !m.sha));
    if (same.length) await db.dataMeta.bulkPut(same.map((m) => ({ ...m, commit: state.commit, sha: shas[m.path] })));
    set({ total: todo.length });
    const src = currentSource();
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const path = todo[i++]!;
        set({ current: path.replace(/\.(json|cat|gst)$/, '') });
        await fetchDataFile(src, state.commit, path, shas[path]);
        set({ done: status.done + 1 });
        // Let the page breathe between big writes so taps still work during the download.
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    await Promise.all([worker(), worker()]);
    if (todo.length) clearIndexCache();
    set({ running: false, current: undefined, finishedAt: Date.now() });
  } catch (e) {
    set({ running: false, current: undefined, error: e instanceof Error ? e.message : String(e) });
  }
}

const WP_KEY = 'emperorslist.wahapediaStamp';
const WP_FILES: [keyof WahapediaFiles, string][] = [
  ['factions', 'Factions.csv'],
  ['stratagems', 'Stratagems.csv'],
  ['enhancements', 'Enhancements.csv'],
  ['detachmentAbilities', 'Detachment_abilities.csv'],
  ['abilities', 'Abilities.csv'],
];

/**
 * Wahapedia's export is fetched when the site is built (browsers aren't
 * allowed to download it directly) and published next to the app. Import it
 * whenever the site has a newer copy.
 */
export async function syncWahapedia(force = false): Promise<{ imported: number } | undefined> {
  const base = `${import.meta.env.BASE_URL}wahapedia/`;
  try {
    const stampRes = await fetch(`${base}Last_update.csv`, { cache: 'no-cache' });
    if (!stampRes.ok) return undefined;
    const stamp = (await stampRes.text()).trim();
    let prev = '';
    try {
      prev = localStorage.getItem(WP_KEY) ?? '';
    } catch {
      /* ignore */
    }
    const haveCore = (await db.imported.where('kind').equals('coreRule').count()) > 0;
    if (!force && stamp === prev && (await db.imported.count()) > 0 && haveCore) return undefined;
    const parts: WahapediaFiles = {};
    for (const [key, file] of WP_FILES) {
      const res = await fetch(base + file, { cache: 'no-cache' });
      if (res.ok) parts[key] = await res.text();
    }
    const rules = importWahapedia(parts);
    try {
      const core = await fetch(`${base}core-rules.json`, { cache: 'no-cache' });
      if (core.ok) {
        const body = (await core.json()) as { sections?: CoreSection[] };
        rules.push(...coreSectionsToRules(body.sections ?? []));
      }
    } catch {
      /* no core rules on this site */
    }
    if (!rules.length) return undefined;
    await db.transaction('rw', db.imported, async () => {
      await db.imported.clear();
      await db.imported.bulkPut(rules);
    });
    try {
      localStorage.setItem(WP_KEY, stamp);
    } catch {
      /* ignore */
    }
    await loadCoreRules();
    await syncMissions(true);
    return { imported: rules.length };
  } catch {
    return undefined;
  }
}

const MISSION_KEY = 'emperorslist.missionsStamp';

/** Mission-deck card text, published next to the app by the build (scripts/missions.mjs). */
export async function syncMissions(force = false): Promise<number | undefined> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}wahapedia/missions.json`, { cache: 'no-cache' });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { fetchedAt?: string; cards?: MissionCard[] };
    const stamp = body.fetchedAt ?? '';
    let prev = '';
    try {
      prev = localStorage.getItem(MISSION_KEY) ?? '';
    } catch {
      /* ignore */
    }
    const have = await db.imported.where('kind').equals('mission').count();
    if (!force && stamp && stamp === prev && have > 0) return have;
    const rows = missionCardsToRules(body.cards ?? []);
    if (!rows.length) return undefined;
    await db.transaction('rw', db.imported, async () => {
      await db.imported.where('kind').equals('mission').delete();
      await db.imported.bulkPut(rows);
    });
    try {
      localStorage.setItem(MISSION_KEY, stamp);
    } catch {
      /* ignore */
    }
    return rows.length;
  } catch {
    return undefined;
  }
}

/** Make the stored Core Rules available to rule popups and tappable words. */
export async function loadCoreRules() {
  const rows = await db.imported.where('kind').equals('coreRule').toArray();
  setCoreSections(rows.map((r) => ({ num: r.detachment ?? '', title: r.name, text: r.text })).sort((a, b) => a.num.localeCompare(b.num, undefined, { numeric: true })));
}

let started = false;
export function startupSync() {
  if (started) return;
  started = true;
  void loadCoreRules();
  void syncAllFactions();
  void syncWahapedia().then(() => syncMissions());
}
