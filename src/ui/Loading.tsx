import { useEffect, useState } from 'react';

/** Shown while saved data is read; explains what to do if it never arrives. */
export function Loading({ what = 'your data' }: { what?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="muted" style={{ padding: '12px 0' }} role="status">
      Loading {what}…
      {slow && (
        <p className="small">
          This is taking longer than it should. The phone may be busy downloading game data, or another EmperorsList tab is open on an older version.{' '}
          <button className="btn btn-sm" onClick={() => location.reload()}>
            Reload
          </button>
        </p>
      )}
    </div>
  );
}
