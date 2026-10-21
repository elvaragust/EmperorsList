import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/** A browser "close request" (the phone's Back button or gesture, or Escape), where the browser has it (Chrome 120+). */
interface CloseWatcherLike {
  onclose: (() => void) | null;
  destroy(): void;
}
type CloseWatcherCtor = new () => CloseWatcherLike;

/** Open sheets, newest last: only the top one answers Escape and Tab. */
const openSheets: HTMLElement[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet used for definitions, pickers and menus. Close with ✕, by
 * tapping outside, with Escape or with the phone's Back button. Keyboard focus
 * starts in the sheet, stays in it while it's open and goes back to where it
 * was when it closes.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  // Callers pass a new onClose on every render: keep the latest without re-running the open effect
  // (that used to pull focus out of a field after every typed letter).
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  // Where focus was before the sheet opened, read before a field inside it can autofocus.
  const opener = useRef<Element | null>(null);
  if (!open) opener.current = null;
  else if (!opener.current) opener.current = document.activeElement;

  useEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const back = opener.current as HTMLElement | null;
    openSheets.push(el);
    const isTop = () => openSheets[openSheets.length - 1] === el;

    // Android Back closes the sheet instead of leaving the screen. The browser keeps these
    // in a stack itself, so Back closes the newest sheet first; it also delivers Escape.
    const Watcher = (window as unknown as { CloseWatcher?: CloseWatcherCtor }).CloseWatcher;
    let watcher: CloseWatcherLike | undefined;
    try {
      watcher = Watcher ? new Watcher() : undefined;
      if (watcher) watcher.onclose = () => close.current();
    } catch {
      watcher = undefined;
    }

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape' && !watcher) {
        close.current();
      } else if (e.key === 'Tab') {
        // Keep Tab inside the sheet.
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        const at = document.activeElement;
        if (!first || !last) {
          e.preventDefault();
          el.focus();
        } else if (e.shiftKey && (at === first || at === el || !el.contains(at))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (at === last || !el.contains(at))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    // Keep the page behind still, and start keyboard focus inside the sheet (unless a field in it already has it).
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!el.contains(document.activeElement)) el.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      watcher?.destroy();
      const i = openSheets.lastIndexOf(el);
      if (i >= 0) openSheets.splice(i, 1);
      document.body.style.overflow = prev;
      // Hand focus back, unless it has already moved on elsewhere or the opener is gone.
      const at = document.activeElement;
      if (back?.isConnected && (!at || at === document.body || el.contains(at))) back.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={() => close.current()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1} ref={box} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          {title ? <h2>{title}</h2> : <span style={{ flex: 1 }} />}
          <button className="icon-btn sheet-close" aria-label="Close" onClick={() => close.current()}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * "Are you sure?" for things that can't be undone (deleting a list or game,
 * leaving a live game, handing the turn over). One clear question, what will
 * happen, and the action named on the button.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  message,
  confirm,
  onConfirm,
  danger,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: ReactNode;
  /** The action on the button: "Delete list", "Hand over the turn". */
  confirm: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {message && <div className="confirm-message">{message}</div>}
      <div className="confirm-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirm}
        </button>
      </div>
    </Sheet>
  );
}
