import type { SavedGame } from '@/data/db';
import { uid } from '@/data/rosters';
import { makeRoomCode, newLiveState, type LivePlayer } from '@/engine/live';
import type { Roster } from '@/engine/types';
import { newGame } from './games';

const NAME_KEY = 'emperorslist.playerName';
export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function rememberName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}

function player(roster: Roster, name: string): LivePlayer {
  return { id: uid(), name: name || 'Player', team: 'A', army: roster.name, faction: roster.factionName, detachments: roster.detachmentNames ?? [], disposition: roster.forceDisposition };
}

export function newHostedGame(roster: Roster, name: string): SavedGame {
  const me = player(roster, name);
  const room = makeRoomCode();
  return { ...newGame(roster), live: { room, role: 'host', myId: me.id, myName: me.name, me, state: newLiveState(room, me) } };
}

export function newJoinedGame(roster: Roster, name: string, room: string): SavedGame {
  const me = player(roster, name);
  return { ...newGame(roster), opponentName: '', live: { room: room.toUpperCase(), role: 'guest', myId: me.id, myName: me.name, me } };
}
