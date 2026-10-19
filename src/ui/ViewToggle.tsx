import { useNavigate } from 'react-router-dom';
import type { Roster } from '@/engine/types';
import { endPractice, startPractice } from '@/screens/play/games';

/**
 * Build / Play switch at the top of a list. Play opens the battle screen for the
 * list as a practice game (round 1, against "Opponent"); going back to Build
 * throws it away, so nothing is kept.
 */
export function ViewToggle({ rosterId, roster, current }: { rosterId: string; roster?: Roster; current: 'build' | 'play' }) {
  const navigate = useNavigate();
  const build = async () => {
    if (current === 'build') return;
    await endPractice(rosterId);
    navigate(`/roster/${rosterId}`, { replace: true });
  };
  const play = async () => {
    if (current === 'play' || !roster) return;
    await startPractice(roster);
    navigate(`/roster/${rosterId}/play`);
  };
  return (
    <div className="view-toggle" role="tablist" aria-label="View">
      <button role="tab" aria-selected={current === 'build'} className={current === 'build' ? 'on' : undefined} onClick={() => void build()}>
        Build
      </button>
      <button
        role="tab"
        aria-selected={current === 'play'}
        className={current === 'play' ? 'on' : undefined}
        onClick={() => void play()}
        disabled={current === 'build' && !roster}
        title="Try the battle screen with this list. Nothing is saved — use Start game for a real one."
      >
        Practice
      </button>
    </div>
  );
}
