import { useEffect, useMemo, useState } from 'react';
import { buildIndex, type DataIndex } from '@/engine/bsdata/index';
import type { RawFile } from '@/engine/bsdata/raw';
import { RosterEngine, rootOptions, type RootOption } from '@/engine/rules/rosterEngine';
import { refreshCaches } from '@/engine/rules/edit';
import type { Roster } from '@/engine/types';
import { db } from './db';
import { parseDataFile } from './dataPacks';

/**
 * Builds the in-memory data index for a faction from the device cache:
 * the game system, the faction catalogue and everything it links to.
 * Parsed indexes are kept for the session.
 */
const indexes = new Map<string, Promise<DataIndex>>();
const rootsCache = new WeakMap<DataIndex, Map<string, RootOption[]>>();

export function clearIndexCache() {
  indexes.clear();
}

export async function loadIndex(catalogueId: string): Promise<DataIndex> {
  let p = indexes.get(catalogueId);
  if (!p) {
    p = (async () => {
      const files: RawFile[] = [];
      const gst = await db.dataFiles.filter((f) => Boolean(f.gameSystem)).first();
      if (gst) files.push(parseDataFile(gst.json));
      const seen = new Set<string>();
      const queue = [catalogueId];
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const rec = await db.dataFiles.where('catalogueId').equals(id).first();
        if (!rec) continue;
        const file = parseDataFile(rec.json);
        files.push(file);
        file.catalogue?.catalogueLinks?.forEach((l) => queue.push(l.targetId));
      }
      if (files.length < 2) throw new Error('This faction is not downloaded on this device yet.');
      return buildIndex(files);
    })();
    indexes.set(catalogueId, p);
    p.catch(() => indexes.delete(catalogueId));
  }
  return p;
}

/** Every downloaded catalogue in one index (for Reference search across factions). */
export async function loadAllIndex(): Promise<DataIndex> {
  const key = '*all*';
  let p = indexes.get(key);
  if (!p) {
    p = db.dataFiles.toArray().then((recs) => buildIndex(recs.map((r) => parseDataFile(r.json))));
    indexes.set(key, p);
    p.catch(() => indexes.delete(key));
  }
  return p;
}

export function rootsFor(index: DataIndex, catalogueId: string): RootOption[] {
  let m = rootsCache.get(index);
  if (!m) {
    m = new Map();
    rootsCache.set(index, m);
  }
  let r = m.get(catalogueId);
  if (!r) {
    r = rootOptions(index, catalogueId);
    m.set(catalogueId, r);
  }
  return r;
}

export function useIndex(catalogueId: string | undefined): { index?: DataIndex; error?: string } {
  const [state, setState] = useState<{ index?: DataIndex; error?: string }>({});
  useEffect(() => {
    let live = true;
    if (!catalogueId) return;
    setState({});
    loadIndex(catalogueId).then(
      (index) => live && setState({ index }),
      (e: unknown) => live && setState({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [catalogueId]);
  return state;
}

export function useAllIndex(): { index?: DataIndex; error?: string } {
  const [state, setState] = useState<{ index?: DataIndex; error?: string }>({});
  const count = useCount();
  useEffect(() => {
    let live = true;
    indexes.delete('*all*');
    loadAllIndex().then(
      (index) => live && setState({ index }),
      (e: unknown) => live && setState({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [count]);
  return state;
}

function useCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    db.dataFiles.count().then(setN);
  }, []);
  return n;
}

/** A rules engine for a roster, rebuilt whenever the roster object changes. */
export function useRosterEngine(roster: Roster | undefined): { engine?: RosterEngine; index?: DataIndex; error?: string } {
  const { index, error } = useIndex(roster?.catalogueId);
  const engine = useMemo(() => {
    if (!index || !roster) return undefined;
    return new RosterEngine(index, roster, rootsFor(index, roster.catalogueId));
  }, [index, roster]);
  return { engine, index, error };
}

/** Save a roster after recomputing cached unit names and points from the data. */
export async function saveRoster(index: DataIndex | undefined, roster: Roster): Promise<Roster> {
  let next = { ...roster, updatedAt: Date.now() };
  if (index) {
    const engine = new RosterEngine(index, next, rootsFor(index, next.catalogueId));
    next = { ...next, units: refreshCaches(engine, next.units) };
  }
  await db.rosters.put(next);
  return next;
}
