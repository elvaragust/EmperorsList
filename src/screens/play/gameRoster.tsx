import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, type SavedGame } from '@/data/db';
import { toPayload } from '@/engine/share';
import type { Roster } from '@/engine/types';
import { roomFor } from '@/sync/room';
import { Sheet } from '@/ui/Sheet';
import { showToast } from '@/ui/Toast';

/**
 * The army a game is played with. A game keeps its own copy of the list, taken
 * when it starts, so editing the list later doesn't rewrite games:
 *  - finished games keep the list they were played with;
 *  - while setting up, the copy follows the list (nothing has happened yet);
 *  - mid-game, a changed list is offered (`changed`) and the player decides.
 * Practice games always use the list as it is. Older games without a copy
 * take one the first time they're opened (finished ones fall back to the list).
 */
export function useGameRoster(game: SavedGame | undefined): { roster?: Roster; latest?: Roster; changed: boolean } {
  const latest = useLiveQuery(() => (game ? db.rosters.get(game.rosterId) : undefined), [game?.rosterId]);
  const setup = game?.stage === 'setup' && !game.idle;
  useEffect(() => {
    if (!game || game.practice || !latest) return;
    const copy = game.roster;
    if (!copy && game.stage !== 'done') void db.games.update(game.id, { roster: latest });
    // Before the battle starts, the game simply uses the newest list.
    else if (copy && setup && copy.updatedAt !== latest.updatedAt) void adoptList(game, latest);
  }, [game, latest, setup]);
  if (!game) return { changed: false };
  if (game.practice) return { roster: latest, latest, changed: false };
  const roster = game.roster ?? latest;
  const changed = Boolean(game.roster && latest && game.stage === 'battle' && !game.idle && latest.updatedAt !== game.roster.updatedAt && latest.updatedAt !== game.listKept);
  return { roster, latest, changed };
}

/** Play on with the newer list: take a fresh copy, and in a live game show it to the others too. */
async function adoptList(game: SavedGame, list: Roster) {
  // Only these fields: the live game's shared state is saved by the room and must not be overwritten with an older copy.
  const patch: Record<string, unknown> = { roster: list, rosterName: list.name, listKept: undefined };
  if (game.live) {
    const me = { ...game.live.me, army: list.name, detachments: list.detachmentNames ?? [], list: toPayload(list) };
    patch['live.me'] = me;
    roomFor(game)?.dispatch({ t: 'join', player: me });
  }
  await db.games.update(game.id, patch as Partial<SavedGame>);
}

/** Mid-game the list was edited: use the changed list in this game, or keep playing with the one it started with. */
export function ListChangedSheet({ game, latest, open }: { game: SavedGame; latest?: Roster; open: boolean }) {
  const [later, setLater] = useState(false);
  if (!latest || !open || later) return null;
  return (
    <Sheet open onClose={() => setLater(true)} title="Your list has changed">
      <p className="confirm-message">
        <strong>{latest.name}</strong> was edited after this game started. Use the changed list in this game{game.live ? ' (the other players see it too)' : ''}, or keep the army the game started with?
      </p>
      <p className="small muted">Removed models and wounds stay on units that are still in the list.</p>
      <div className="confirm-actions">
        <button
          className="btn"
          onClick={() => {
            void db.games.update(game.id, { listKept: latest.updatedAt });
            showToast('Keeping the army this game started with');
          }}
        >
          Keep the game's army
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            void adoptList(game, latest);
            showToast('This game now uses the changed list');
          }}
        >
          Use the changed list
        </button>
      </div>
    </Sheet>
  );
}
