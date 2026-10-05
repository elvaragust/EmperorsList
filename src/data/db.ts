import Dexie, { type Table } from 'dexie';
import type { Roster } from '@/engine/types';

/** A downloaded game-data file, cached on this device only. Never uploaded anywhere. */
export interface CachedDataFile {
  path: string; // e.g. "Imperium - Black Templars.json"
  source: string; // e.g. "BSData/wh40k-11e"
  commit: string; // git commit the file was fetched at
  fetchedAt: number;
  json: unknown;
}

export interface DataSourceState {
  source: string;
  commit: string;
  fetchedAt: number;
  files: string[];
}

export interface SavedGame {
  id: string;
  rosterId: string;
  opponentName: string;
  startedAt: number;
  finishedAt?: number;
  round: number;
  vp: { me: number; them: number };
  cp: number;
  log: { at: number; text: string }[];
}

export interface CollectionItem {
  entryId: string;
  name: string;
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

  constructor() {
    super('emperorslist');
    this.version(1).stores({
      rosters: 'id, name, folder, catalogueId, updatedAt',
      games: 'id, rosterId, startedAt',
      collection: 'entryId, name',
      dataFiles: 'path, source',
      dataSources: 'source',
    });
  }
}

export const db = new EmperorsListDB();
