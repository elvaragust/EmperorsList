import { NavLink, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/lists', also: ['/roster', '/new', '/import'], label: 'LISTS', path: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01' },
  { to: '/reference', label: 'REFERENCE', path: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11' },
  { to: '/play', label: 'PLAY', path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { to: '/collection', label: 'COLLECTION', path: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10' },
  { to: '/settings', label: 'SETTINGS', path: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1' },
];

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab${isActive || ('also' in t && t.also?.some((p) => pathname.startsWith(p))) ? ' active' : ''}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={t.path} />
          </svg>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
