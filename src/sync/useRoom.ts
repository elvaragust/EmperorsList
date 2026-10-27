import { useEffect, useState } from 'react';
import type { SavedGame } from '@/data/db';
import { roomFor, type Room } from './room';

/** Keep the live room for a game open and re-render when its connection status changes. */
export function useRoom(game: SavedGame | undefined): Room | undefined {
  const [, setTick] = useState(0);
  const room = game?.live ? roomFor(game) : undefined;
  useEffect(() => room?.subscribe(() => setTick((t) => t + 1)), [room]);
  // Back from the background (screen unlocked, app switched to): redial at once instead of waiting for the next retry.
  useEffect(() => {
    if (!room) return;
    const back = () => document.visibilityState === 'visible' && room.status !== 'online' && room.status !== 'asleep' && room.wake();
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [room]);
  return room;
}
