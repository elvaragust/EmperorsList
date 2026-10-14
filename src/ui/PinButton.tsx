import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Pin } from '@/data/db';
import { showToast } from './Toast';

/** Star toggle that pins or unpins something. Pins show at the top of Reference and in battle. */
export function PinButton({ pin, small }: { pin: Omit<Pin, 'createdAt'>; small?: boolean }) {
  const pinned = useLiveQuery(() => db.pins.get(pin.id).then(Boolean), [pin.id]);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (pinned) {
      void db.pins.delete(pin.id);
      showToast(`Unpinned ${pin.name}`);
    } else {
      void db.pins.put({ ...pin, createdAt: Date.now() });
      showToast(`Pinned ${pin.name}`, { label: 'VIEW PINS', to: '/reference/pinned' });
    }
  };
  return (
    <button
      className="icon-btn pin-btn"
      aria-pressed={Boolean(pinned)}
      aria-label={pinned ? `Unpin ${pin.name}` : `Pin ${pin.name}`}
      title={pinned ? 'Unpin' : 'Pin'}
      onClick={toggle}
      style={small ? { width: 32, height: 32 } : undefined}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
      </svg>
    </button>
  );
}

export const pinId = (kind: string, name: string, extra = '') => `${kind}:${name.toLowerCase()}${extra ? `:${extra}` : ''}`;

/** Names (lower case) of everything pinned of one kind, e.g. 'datasheet'. */
export function usePinnedNames(kind: string): Set<string> {
  const pins = useLiveQuery(() => db.pins.where('kind').equals(kind).toArray(), [kind]);
  return new Set((pins ?? []).map((p) => p.name.toLowerCase()));
}

/** Small filled star shown next to something pinned. */
export function PinnedMark() {
  return (
    <span className="pinned-mark" title="Pinned" aria-label="Pinned">
      ★
    </span>
  );
}
