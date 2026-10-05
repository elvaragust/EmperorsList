import Dexie, { type Table } from 'dexie';
import type { Roster } from '@/engine/types';
import type { ImportedRule } from '@/engine/wahapedia';

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

import type { Phase } from '@/engine/game';
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
  }
}

export const db = new EmperorsListDB();
