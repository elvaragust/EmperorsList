import Dexie, { type Table } from 'dexie';
import type { Roster } from '@/engine/types';
import type { ImportedRule } from '@/engine/wahapedia';
import type { Phase } from '@/engine/game';
import type { LivePlayer, LiveState } from '@/engine/live';

/** A downloaded game-data file, cached on this device only. Never uploaded anywhere. */
export interface CachedDataFile {
  path: string; // e.g. "Imperium - Black Templars.json"
  source: string; // e.g. "BSData/wh40k-11e"
  commit: string; // git commit the file was fetched at
  fetchedAt: number;
  json: unknown;
  catalogueId?: string;
  name?: string;
  library?: boolean;
  gameSystem?: boolean;
}

export interface DataSourceState {
  source: string;
  commit: string;
  fetchedAt: number;
  files: string[];
}

export type { Phase };

export interface GameLogEntry {
  at: number;
  round: number;
  turn: 'me' | 'them';
  phase?: Phase;
  text: string;
  kind?: 'cp' | 'vp' | 'stratagem' | 'casualty' | 'note' | 'phase';
}

export interface SavedGame {
  id: string;
  rosterId: string;
  rosterName: string;
  factionName: string;
  opponentName: string;
  opponentFaction?: string;
  opponentList?: string;
  mission?: string;
  deployment?: string;
  twist?: string;
  secondaries?: { me: string; them: string };
  checklist?: Record<string, boolean>;
  firstTurn?: 'me' | 'them';
  startedAt: number;
  finishedAt?: number;
  stage: 'setup' | 'battle' | 'done';
  setupStep: number;
  round: number;
  turn: 'me' | 'them';
  phase: Phase;
  cp: { me: number; them: number };
  vp: { me: { primary: number[]; secondary: number[] }; them: { primary: number[]; secondary: number[] } };
  /** unit id -> dead model ids */
  casualties: Record<string, string[]>;
  /** Stratagem ids used, per round, to warn about repeats. */
  used: { round: number; turn: 'me' | 'them'; phase: Phase; id: string; name: string }[];
  log: GameLogEntry[];
  result?: 'win' | 'loss' | 'draw';
  notes?: string;
  /** Set for games played live across phones. The shared state comes from the host. */
  live?: { room: string; role: 'host' | 'guest'; myId: string; myName: string; me: LivePlayer; state?: LiveState; unlinked?: boolean };
  /** Last time anything in the game changed (set automatically on every save). */
  lastActiveAt?: number;
  /** Set when the game was ended for inactivity; holds what is needed to resume it. */
  idle?: { at: number; stage: SavedGame['stage']; unlinked?: boolean };
}

/** A saved table layout: the user's own photo or drawing. */
export interface Layout {
  id: string;
  name: string;
  /** data: URL of a downscaled image */
  image: string;
  notes?: string;
  createdAt: number;
}

/** Something the user pinned to keep at hand: a unit, stratagem, enhancement, detachment or rule. */
export interface Pin {
  id: string;
  kind: import('@/engine/types').RuleKind;
  name: string;
  text?: string;
  source?: string;
  /** Screen to open for units and factions; others open as a popup. */
  route?: string;
  createdAt: number;
}

export interface CollectionItem {
  entryId: string;
  name: string;
  catalogueId: string;
  owned: number;
  built: number;
  painted: number;
}

class EmperorsListDB extends Dexie {
  rosters!: Table<Roster, string>;
  games!: Table<SavedGame, string>;
  collection!: Table<CollectionItem, string>;
  dataFiles!: Table<CachedDataFile, string>;
  dataSources!: Table<DataSourceState, string>;
  imported!: Table<ImportedRule, string>;
  layouts!: Table<Layout, string>;
  pins!: Table<Pin, string>;

  constructor() {
    super('emperorslist');
    this.version(1).stores({
      rosters: 'id, name, folder, catalogueId, updatedAt',
      games: 'id, rosterId, startedAt',
      collection: 'entryId, name',
      dataFiles: 'path, source',
      dataSources: 'source',
    });
    this.version(2)
      .stores({
        rosters: 'id, name, folder, catalogueId, updatedAt',
        games: 'id, rosterId, startedAt',
        collection: 'entryId, name, catalogueId',
        dataFiles: 'path, source, catalogueId',
        dataSources: 'source',
        imported: 'id, kind, faction',
      })
      .upgrade(async (tx) => {
        await tx
          .table('rosters')
          .toCollection()
          .modify((r: Roster) => {
            r.config ??= [];
            r.detachmentIds ??= [];
            r.units ??= [];
          });
      });
    this.version(3).stores({
      rosters: 'id, name, folder, catalogueId, updatedAt',
      games: 'id, rosterId, startedAt',
      collection: 'entryId, name, catalogueId',
      dataFiles: 'path, source, catalogueId',
      dataSources: 'source',
      imported: 'id, kind, faction',
      layouts: 'id, name, createdAt',
    });
    this.version(4).stores({
      rosters: 'id, name, folder, catalogueId, updatedAt',
      games: 'id, rosterId, startedAt',
      collection: 'entryId, name, catalogueId',
      dataFiles: 'path, source, catalogueId',
      dataSources: 'source',
      imported: 'id, kind, faction',
      layouts: 'id, name, createdAt',
      pins: 'id, kind, createdAt',
    });
  }
}

export const db = new EmperorsListDB();

// Every change to a game counts as activity, except the inactivity bookkeeping itself.
const QUIET = new Set(['idle', 'lastActiveAt']);
db.games.hook('creating', (_key, obj) => {
  obj.lastActiveAt ??= Date.now();
});
db.games.hook('updating', (mods) => {
  const keys = Object.keys(mods);
  if (!keys.length || keys.some((k) => QUIET.has(k.split('.')[0]!))) return undefined;
  return { lastActiveAt: Date.now() };
});
