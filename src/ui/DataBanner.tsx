import { syncAllFactions, useSyncStatus } from '@/data/bootstrap';

/** Slim bar at the top while game data downloads in the background. */
export function DataBanner() {
  const s = useSyncStatus();
  if (!s.running && !s.error) return null;
  if (s.error)
    return (
      <div className="data-banner error" role="status">
        <span style={{ flex: 1 }}>Couldn't update game data: {s.error}</span>
        <button className="btn btn-sm btn-ghost" onClick={() => syncAllFactions(true)}>
          Retry
        </button>
      </div>
    );
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  return (
    <div className="data-banner" role="status">
      <span style={{ flex: 1 }}>
        {s.total ? `Loading factions ${s.done}/${s.total}` : s.current}
      </span>
      <span className="muted">{s.total ? `${pct}%` : ''}</span>
      <div className="data-banner-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}
