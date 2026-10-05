import { db, type DataSourceState } from './db';

/**
 * Game data is downloaded on the user's own device from a public GitHub repo
 * and cached in IndexedDB. Nothing is bundled with the app or proxied through
 * a server. The repo can be swapped for a fork in Settings.
 */
export const DEFAULT_SOURCE = { owner: 'BSData', repo: 'wh40k-11e', branch: 'main' };

export interface SourceConfig {
  owner: string;
  repo: string;
  branch: string;
}

const api = (s: SourceConfig, path: string) => `https://api.github.com/repos/${s.owner}/${s.repo}/${path}`;
const raw = (s: SourceConfig, commit: string, file: string) =>
  `https://raw.githubusercontent.com/${s.owner}/${s.repo}/${commit}/${encodeURIComponent(file)}`;

export async function latestCommit(s: SourceConfig = DEFAULT_SOURCE): Promise<string> {
  const res = await fetch(api(s, `commits/${s.branch}`), { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`Could not reach ${s.owner}/${s.repo} (${res.status})`);
  const body = (await res.json()) as { sha: string };
  return body.sha;
}

/** Data files at a commit: the game system plus every catalogue (.json, or .gst/.cat in older repos). */
export async function listDataFiles(s: SourceConfig, commit: string): Promise<string[]> {
  const res = await fetch(api(s, `git/trees/${commit}`));
  if (!res.ok) throw new Error(`Could not list files (${res.status})`);
  const body = (await res.json()) as { tree: { path: string; type: string }[] };
  return body.tree
    .filter((t) => t.type === 'blob' && /\.(json|gst|cat)$/i.test(t.path) && !/package|tsconfig/i.test(t.path))
    .map((t) => t.path);
}

/** Download one file into the device cache (JSON parsed; XML kept as text for normalizeXml). */
export async function fetchDataFile(s: SourceConfig, commit: string, path: string) {
  const res = await fetch(raw(s, commit, path));
  if (!res.ok) throw new Error(`Could not download ${path} (${res.status})`);
  const json = path.endsWith('.json') ? await res.json() : await res.text();
  await db.dataFiles.put({ path, source: `${s.owner}/${s.repo}`, commit, fetchedAt: Date.now(), json });
}

/** Check for a newer commit and download the game system plus the chosen factions. */
export async function syncSource(
  wanted: (path: string) => boolean,
  onProgress?: (done: number, total: number, path: string) => void,
  s: SourceConfig = DEFAULT_SOURCE,
): Promise<DataSourceState> {
  const commit = await latestCommit(s);
  const files = await listDataFiles(s, commit);
  const chosen = files.filter((f) => wanted(f));
  let done = 0;
  for (const path of chosen) {
    onProgress?.(done, chosen.length, path);
    await fetchDataFile(s, commit, path);
    done += 1;
  }
  const state: DataSourceState = { source: `${s.owner}/${s.repo}`, commit, fetchedAt: Date.now(), files };
  await db.dataSources.put(state);
  return state;
}
