import { normalizeXml } from '@/engine/bsdata/normalizeXml';
import type { RawCatalogue, RawFile } from '@/engine/bsdata/raw';
import { db, metaOf, type CachedDataFile, type DataSourceState } from './db';

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

const SOURCE_KEY = 'emperorslist.source';

export function currentSource(): SourceConfig {
  try {
    const raw = localStorage.getItem(SOURCE_KEY);
    if (raw) return { ...DEFAULT_SOURCE, ...(JSON.parse(raw) as Partial<SourceConfig>) };
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_SOURCE;
}

export function setSource(s: SourceConfig) {
  try {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export const sourceName = (s: SourceConfig) => `${s.owner}/${s.repo}`;
const api = (s: SourceConfig, path: string) => `https://api.github.com/repos/${s.owner}/${s.repo}/${path}`;
const raw = (s: SourceConfig, commit: string, file: string) =>
  `https://raw.githubusercontent.com/${s.owner}/${s.repo}/${commit}/${file.split('/').map(encodeURIComponent).join('/')}`;

export async function latestCommit(s: SourceConfig = currentSource()): Promise<string> {
  const res = await fetch(api(s, `commits/${s.branch}`), { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`Could not reach ${s.owner}/${s.repo} (${res.status}${res.status === 403 ? ', GitHub rate limit — try again in a while' : ''})`);
  const body = (await res.json()) as { sha: string };
  return body.sha;
}

/** Data files at a commit: the game system plus every catalogue (.json, or .gst/.cat in older repos). */
export async function listDataFiles(s: SourceConfig, commit: string): Promise<{ path: string; sha?: string }[]> {
  const res = await fetch(api(s, `git/trees/${commit}`));
  if (!res.ok) throw new Error(`Could not list files (${res.status})`);
  const body = (await res.json()) as { tree: { path: string; type: string; sha?: string }[] };
  return body.tree
    .filter((t) => t.type === 'blob' && /\.(json|gst|cat)$/i.test(t.path) && !/package|tsconfig|\.github/i.test(t.path))
    .map((t) => ({ path: t.path, sha: t.sha }));
}

export function parseDataFile(json: unknown): RawFile {
  if (typeof json === 'string') return normalizeXml(json);
  return json as RawFile;
}

/** Download one file into the device cache. */
export async function fetchDataFile(s: SourceConfig, commit: string, path: string, sha?: string): Promise<CachedDataFile> {
  const res = await fetch(raw(s, commit, path));
  if (!res.ok) throw new Error(`Could not download ${path} (${res.status})`);
  const json = path.endsWith('.json') ? await res.json() : await res.text();
  const file = parseDataFile(json);
  const cat = (file.catalogue ?? file.gameSystem) as RawCatalogue | undefined;
  const rec: CachedDataFile = {
    path,
    source: sourceName(s),
    commit,
    fetchedAt: Date.now(),
    json,
    catalogueId: cat?.id,
    name: cat?.name,
    library: Boolean(cat?.library),
    gameSystem: Boolean(file.gameSystem),
  };
  await db.transaction('rw', db.dataFiles, db.dataMeta, async () => {
    await db.dataFiles.put(rec);
    await db.dataMeta.put(metaOf(rec, sha ?? (await db.dataSources.get(sourceName(s)))?.shas?.[path]));
  });
  return rec;
}

const isGameSystemPath = (p: string) => /\.gst$/i.test(p) || /^Warhammer 40,000\.json$/i.test(p);

/** The repo's file list, from the cache when offline. Refreshes the source record when online. */
export async function sourceState(refresh = false, s: SourceConfig = currentSource()): Promise<DataSourceState> {
  const cached = await db.dataSources.get(sourceName(s));
  if (cached && !refresh) return cached;
  try {
    const commit = await latestCommit(s);
    if (cached && cached.commit === commit) return cached;
    const listed = await listDataFiles(s, commit);
    const shas: Record<string, string> = {};
    listed.forEach((f) => f.sha && (shas[f.path] = f.sha));
    const state: DataSourceState = { source: sourceName(s), commit, fetchedAt: Date.now(), files: listed.map((f) => f.path), shas };
    await db.dataSources.put(state);
    return state;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

export interface FactionFile {
  path: string;
  /** "Black Templars" */
  name: string;
  /** "Imperium" */
  group: string;
  downloaded: boolean;
}

/** Pickable factions: every catalogue file except libraries and the game system. */
export async function listFactions(refresh = false): Promise<FactionFile[]> {
  const state = await sourceState(refresh);
  const cached = new Set((await db.dataMeta.toCollection().primaryKeys()) as string[]);
  return state.files
    .filter((p) => !isGameSystemPath(p) && !/library/i.test(p))
    .map((path) => {
      const stem = path.replace(/\.(json|cat)$/i, '').replace(/^.*\//, '');
      const parts = stem.split(' - ');
      const group = parts.length > 1 ? parts[0]! : stem.match(/Necrons|Orks|Tyranids|T'au|Votann|Genestealer/i) ? 'Xenos' : 'Other';
      return { path, name: parts.length > 1 ? parts.slice(1).join(' - ') : stem, group, downloaded: cached.has(path) };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

/**
 * Download a faction file plus the game system and every catalogue it links
 * to (recursively). Already-cached files at the same commit are reused.
 */
export async function ensureFaction(path: string, onProgress?: (msg: string) => void, s: SourceConfig = currentSource()): Promise<CachedDataFile> {
  const state = await sourceState(false, s);
  const commit = state.commit;
  const files = state.files;
  const get = async (p: string): Promise<CachedDataFile> => {
    const hit = await db.dataFiles.get(p);
    if (hit) return hit;
    onProgress?.(`Downloading ${p.replace(/\.json$/, '')}…`);
    return fetchDataFile(s, commit, p);
  };
  const gst = files.find(isGameSystemPath);
  if (gst) await get(gst);
  const main = await get(path);

  const seen = new Set<string>([main.catalogueId ?? '']);
  const queue: CachedDataFile[] = [main];
  while (queue.length) {
    const cur = queue.shift()!;
    const cat = parseDataFile(cur.json).catalogue;
    for (const link of cat?.catalogueLinks ?? []) {
      if (seen.has(link.targetId)) continue;
      seen.add(link.targetId);
      const knownMeta = await db.dataMeta.where('catalogueId').equals(link.targetId).first();
      const known = knownMeta ? await db.dataFiles.get(knownMeta.path) : undefined;
      if (known) {
        queue.push(known);
        continue;
      }
      const guess = guessPath(files, link.name);
      let found: CachedDataFile | undefined;
      if (guess) {
        const f = await get(guess);
        if (f.catalogueId === link.targetId) found = f;
      }
      if (!found) {
        // Fall back to scanning: download candidates until the id turns up.
        for (const p of files) {
          if (isGameSystemPath(p) || (await db.dataMeta.get(p))) continue;
          const f = await get(p);
          if (f.catalogueId === link.targetId) {
            found = f;
            break;
          }
        }
      }
      if (found) queue.push(found);
    }
  }
  return main;
}

function guessPath(files: string[], name: string): string | undefined {
  const want = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const stem = (p: string) => p.replace(/\.(json|cat)$/i, '').replace(/^.*\//, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return files.find((p) => stem(p) === want) ?? files.find((p) => stem(p).endsWith(want) || want.endsWith(stem(p)));
}

/** Re-download every cached file at the latest commit. */
export async function updateAll(onProgress?: (done: number, total: number, path: string) => void, s: SourceConfig = currentSource()): Promise<DataSourceState> {
  const state = await sourceState(true, s);
  const cached = await db.dataMeta.toArray();
  let done = 0;
  for (const f of cached) {
    onProgress?.(done, cached.length, f.path);
    const sha = state.shas?.[f.path];
    const stale = sha ? f.sha !== sha : f.commit !== state.commit;
    if (stale && state.files.includes(f.path)) await fetchDataFile(s, state.commit, f.path, sha);
    done += 1;
  }
  return state;
}
