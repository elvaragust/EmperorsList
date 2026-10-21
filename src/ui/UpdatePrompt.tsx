import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { applyUpdate, busyNow, busyPath, useUpdateReady } from '@/app/updates';
import { Icon } from './Icon';

/** Slim bar when a new version of the app is ready. It never reloads by itself. */
export function UpdatePrompt() {
  const ready = useUpdateReady();
  const [hidden, setHidden] = useState(false);
  const { pathname } = useLocation();
  // Live, so the bar changes once a game ends.
  const busy = useLiveQuery(() => (ready ? busyNow(pathname) : false), [ready, pathname], busyPath(pathname));
  if (!ready || hidden) return null;
  return (
    <div className="data-banner" role="status">
      <span style={{ flex: 1 }}>{busy ? 'Update ready. It installs next time you start the app, so nothing is interrupted.' : 'Update ready.'}</span>
      <button className={`btn btn-sm ${busy ? 'btn-ghost' : 'btn-primary'}`} onClick={applyUpdate}>
        {busy ? 'Reload now' : 'Reload'}
      </button>
      <button className="icon-btn" aria-label="Later" onClick={() => setHidden(true)}>
        <Icon name="close" />
      </button>
    </div>
  );
}
