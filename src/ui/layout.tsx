import { useSyncExternalStore, type ReactNode } from 'react';
import { useOutlet } from 'react-router-dom';
import { useAppearance } from '@/theme/appearance';

/** Width where a list and its detail fit side by side (sidebar + two panes). */
export const SPLIT_QUERY = '(min-width: 1100px)';

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True when the screen is wide enough for two panes and the user hasn't forced the phone column. */
export function useSplit(): boolean {
  const look = useAppearance();
  const wide = useMedia(SPLIT_QUERY);
  return wide && look.layout !== 'phone';
}

/**
 * Layout route: on a phone the child screen (unit, add unit…) replaces the parent;
 * on a wide screen the parent stays on the left and the child opens beside it.
 * The tree shape stays the same either way so the parent isn't remounted.
 */
export function SplitRoute({ main }: { main: ReactNode }) {
  const outlet = useOutlet();
  const split = useSplit();
  const both = split && outlet;
  return (
    <div className={both ? 'split' : 'split single'}>
      {(!outlet || split) && <div className="split-main">{main}</div>}
      {outlet && <div className="split-detail">{outlet}</div>}
    </div>
  );
}
