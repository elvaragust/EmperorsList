import { useState, type ReactNode } from 'react';

/** A bar you tap to open or close a section (like the official app's grey section headers). */
export function Collapse({ title, children, defaultOpen = false, right, tone = 'bar' }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode; tone?: 'bar' | 'plain' }) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => setOpen(!open);
  return (
    <div className={`collapse ${tone} ${open ? 'open' : ''}`}>
      <div className="collapse-head">
        <button className="collapse-title" onClick={toggle} aria-expanded={open}>
          {title}
        </button>
        {right}
        <button className="collapse-chev" onClick={toggle} aria-label={open ? 'Close' : 'Open'} aria-expanded={open}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}
