import { useCallback, useEffect, useRef } from 'react';
import { db, type GameLogEntry, type SavedGame } from '@/data/db';
import { uid } from '@/data/rosters';
import { emptyScore } from '@/engine/game';
import type { Roster } from '@/engine/types';

export function newGame(roster: Roster): SavedGame {
  return {
    id: uid(),
    rosterId: roster.id,
    rosterName: roster.name,
    roster,
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
  const g: SavedGame = { ...newGame(roster), id: practiceId(roster.id), practice: true, opponentName: 'Opponent', stage: 'battle', firstTurn: 'me', cp: { me: 1, them: 1 }, cpGranted: ['1-me'] };
  await db.games.put(g);
}

/** Throw a list's practice game away. */
export async function endPractice(rosterId: string) {
  await db.games.delete(practiceId(rosterId));
}

export async function saveGame(g: SavedGame) {
  await db.games.put(g);
}

/**
 * Change the latest saved copy of a game in one transaction, so two changes
 * made at once (a redraw and its CP, a name saved on blur and the Next it was
 * blurred by) can't overwrite each other. Every change to a game on this
 * screen goes through here — never a put of the copy from the last render.
 */
export async function updateGame(id: string, fn: (g: SavedGame) => SavedGame | undefined) {
  await db.transaction('rw', db.games, async () => {
    const g = await db.games.get(id);
    const next = g && fn(g);
    if (next) await db.games.put(next);
  });
}

export function withLog(g: SavedGame, text: string, kind: GameLogEntry['kind']): SavedGame {
  return { ...g, log: [...g.log, { at: Date.now(), round: g.round, turn: g.turn, phase: g.phase, text, kind }] };
}

/** Change some fields of the latest saved copy (see updateGame). */
export function patchGame(id: string, patch: Partial<SavedGame> | ((g: SavedGame) => Partial<SavedGame>)) {
  return updateGame(id, (g) => ({ ...g, ...(typeof patch === 'function' ? patch(g) : patch) }));
}

/**
 * Save a text field as it is typed: a moment (~300ms) after the last key, and
 * straight away on blur (`flush`) or when the field goes away.
 */
export function useTypedSave(save: (text: string) => unknown, delay = 300) {
  const pending = useRef<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saveRef = useRef(save);
  saveRef.current = save;
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const text = pending.current;
    pending.current = undefined;
    if (text !== undefined) void saveRef.current(text);
  }, []);
  useEffect(() => flush, [flush]);
  const change = useCallback(
    (text: string) => {
      pending.current = text;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );
  return { change, flush };
}

/**
 * Note each side's army health (share of starting wounds left) for the current
 * battle round, so the result screen can show how the battle swung round by
 * round. Only writes when a number changed, and never over an earlier round
 * once a later one has been noted (after going back to an earlier round).
 */
export function useHealthRecorder(gameId: string, round: number, sides: Record<string, number | undefined>, stage: SavedGame['stage']) {
  const key = JSON.stringify(sides);
  useEffect(() => {
    if (stage !== 'battle' || round < 1) return;
    void updateGame(gameId, (g) => {
      const health = { ...g.health };
      let changed = false;
      for (const [side, v] of Object.entries(sides)) {
        if (v === undefined) continue;
        const list = [...(health[side] ?? [])];
        while (list.length < round) list.push(null);
        if (list.slice(round).some((x) => x != null)) continue;
        const value = Math.round(v * 1000) / 1000;
        if (list[round - 1] !== value) {
          list[round - 1] = value;
          health[side] = list;
          changed = true;
        }
      }
      return changed ? { ...g, health } : undefined;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, round, key, stage]);
}
