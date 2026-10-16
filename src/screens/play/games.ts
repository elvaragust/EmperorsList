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

/** Id of a list's practice game (the Play view in the list builder). */
export const practiceId = (rosterId: string) => `practice-${rosterId}`;

/** A fresh practice game for a list: straight into round 1, nothing set up, against "Opponent". */
export async function startPractice(roster: Roster) {
  const g: SavedGame = { ...newGame(roster), id: practiceId(roster.id), practice: true, opponentName: 'Opponent', stage: 'battle', firstTurn: 'me', cp: { me: 1, them: 1 } };
  await db.games.put(g);
}

/** Throw a list's practice game away. */
export async function endPractice(rosterId: string) {
  await db.games.delete(practiceId(rosterId));
}

export async function saveGame(g: SavedGame) {
  await db.games.put(g);
}

export function withLog(g: SavedGame, text: string, kind: GameLogEntry['kind']): SavedGame {
  return { ...g, log: [...g.log, { at: Date.now(), round: g.round, turn: g.turn, phase: g.phase, text, kind }] };
}
