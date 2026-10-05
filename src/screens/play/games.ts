import { db, type GameLogEntry, type SavedGame } from '@/data/db';
import { uid } from '@/data/rosters';
import { emptyScore } from '@/engine/game';
import type { Roster } from '@/engine/types';

export function newGame(roster: Roster): SavedGame {
  return {
    id: uid(),
    rosterId: roster.id,
    rosterName: roster.name,
    factionName: roster.factionName,
    opponentName: '',
    startedAt: Date.now(),
    stage: 'setup',
    setupStep: 1,
    round: 1,
    turn: 'me',
    phase: 'command',
    cp: { me: 0, them: 0 },
    vp: { me: emptyScore(), them: emptyScore() },
    casualties: {},
    used: [],
    log: [],
    checklist: {},
  };
}

export async function saveGame(g: SavedGame) {
  await db.games.put(g);
}

export function withLog(g: SavedGame, text: string, kind: GameLogEntry['kind']): SavedGame {
  return { ...g, log: [...g.log, { at: Date.now(), round: g.round, turn: g.turn, phase: g.phase, text, kind }] };
}
