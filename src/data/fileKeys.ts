/**
 * Cached data files are stored by their path in the repo. When the data
 * source is switched in Settings, a file from the new source whose path is
 * already taken by another source's copy is stored under "path @@ source"
 * instead, so neither copy ever overwrites the other and switching back works
 * offline. These helpers are pure so they can be tested without a database.
 */
const SEP = ' @@ ';

interface Keyed {
  path: string;
  source: string;
}

/** The storage key for a file from `source`, given whatever is stored at its plain path now. */
export function fileKey(path: string, source: string, occupant?: { source: string }): string {
  return !occupant || occupant.source === source ? path : `${path}${SEP}${source}`;
}

/** The second key a source's copy may live under (when another source has the plain path). */
export const altKey = (path: string, source: string) => `${path}${SEP}${source}`;

/** The file's real path in its repo, whatever key it is stored under. */
export function realPath(f: Keyed): string {
  const tail = `${SEP}${f.source}`;
  return f.path.endsWith(tail) ? f.path.slice(0, -tail.length) : f.path;
}

/**
 * Which source's files to use: the current one when anything from it is on
 * this device, otherwise the source with the most files (so cached data keeps
 * working when the current source has never downloaded). Never mixes sources.
 */
export function pickSource(files: { source: string }[], current: string): string | undefined {
  if (files.some((f) => f.source === current)) return current;
  const n = new Map<string, number>();
  files.forEach((f) => n.set(f.source, (n.get(f.source) ?? 0) + 1));
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

/** Of the stored copies of one catalogue, the one from `source` (or, failing that, any). */
export function preferSource<T extends { source: string }>(copies: T[], source: string): T | undefined {
  return copies.find((c) => c.source === source) ?? copies[0];
}
