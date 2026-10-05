import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export function Screen({ title, back, actions, children }: { title: string; back?: boolean; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <main className="screen">
      <header className="screen-header">
        {back && (
          <button className="icon-btn" aria-label="Back" onClick={() => navigate(-1)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <h1 className="screen-title" style={back ? { fontSize: 24 } : undefined}>
          {title}
        </h1>
        {actions}
      </header>
      {children}
    </main>
  );
}
