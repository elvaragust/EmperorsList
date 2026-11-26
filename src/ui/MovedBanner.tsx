import { Link, useLocation } from 'react-router-dom';
import { NEW_HOME } from '@/data/newHome';

/** On the old address (built with VITE_NEW_HOME): a standing note that the app moved, with the way to take your data along. */
export function MovedBanner() {
  const { pathname } = useLocation();
  if (!NEW_HOME || pathname === '/move-out') return null;
  return (
    <div className="data-banner" role="status">
      <span style={{ flex: 1 }}>EmperorsList has a new home.</span>
      <Link className="btn btn-sm" to="/move-out">
        Move my data
      </Link>
    </div>
  );
}
