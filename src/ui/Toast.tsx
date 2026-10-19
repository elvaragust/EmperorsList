import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';

interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; to: string };
}
let current: ToastMsg | null = null;
let seq = 0;
const listeners = new Set<() => void>();

/** Show a short message at the top of the screen (clear of the buttons at the bottom). */
export function showToast(text: string, action?: ToastMsg['action']) {
  current = { id: ++seq, text, action };
  listeners.forEach((l) => l());
}

export function ToastHost() {
  const msg = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
  const navigate = useNavigate();
  const [visible, setVisible] = useState<ToastMsg | null>(null);
  useEffect(() => {
    if (!msg) return;
    setVisible(msg);
    const t = setTimeout(() => setVisible((v) => (v?.id === msg.id ? null : v)), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  if (!visible) return null;
  return (
    <div className="toast-pop" role="status" aria-live="polite">
      <span className="toast-text">{visible.text}</span>
      {visible.action && (
        <button
          className="btn btn-sm btn-ghost"
          style={{ minHeight: 36, padding: '0 8px', color: 'var(--accent)' }}
          onClick={() => {
            setVisible(null);
            navigate(visible.action!.to);
          }}
        >
          {visible.action.label}
        </button>
      )}
    </div>
  );
}
