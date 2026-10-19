import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

/**
 * A screen with a sticky header. `back` shows a back button: it goes back in
 * the app's history, or — when the screen was opened straight from a link or
 * after a reload, with nothing to go back to — to `back` itself when it's a
 * path (else the Lists tab), so back never leaves the app. `onBack` replaces
 * it entirely (a wizard going to its previous step).
 */
export function Screen({ title, back, onBack, actions, children }: { title: string; back?: boolean | string; onBack?: () => void; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (onBack) return onBack();
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(typeof back === 'string' ? back : '/lists', { replace: true });
  };
  return (
    <main className="screen">
      <header className="screen-header">
        {(back || onBack) && (
          <button className="icon-btn" aria-label="Back" onClick={goBack}>
            <Icon name="back" />
          </button>
        )}
        <h1 className="screen-title" style={back || onBack ? { fontSize: 24 } : undefined}>
          {title}
        </h1>
        {actions}
      </header>
      {children}
    </main>
  );
}
