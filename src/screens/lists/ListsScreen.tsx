import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { createRoster, deleteRoster, duplicateRoster } from '@/data/rosters';
import { Screen } from '@/ui/Screen';

export function ListsScreen() {
  const navigate = useNavigate();
  const rosters = useLiveQuery(() => db.rosters.orderBy('updatedAt').reverse().toArray(), []);

  const newList = async () => {
    // The 4-step wizard (faction → size → detachments → disposition) replaces this in phase 2.
    const id = await createRoster({ name: 'New list', factionName: 'Black Templars', catalogueId: '' });
    navigate(`/roster/${id}`);
  };

  return (
    <Screen title="Armies">
      {rosters && rosters.length === 0 && (
        <p className="muted">No lists yet. Create as many as you like.</p>
      )}
      <div className="card">
        {rosters?.map((r) => (
          <div className="row" key={r.id}>
            <Link to={`/roster/${r.id}`} style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{r.name}</div>
              <div className="muted small">
                {r.factionName} · {r.pointsLimit.toLocaleString('en')} pts
              </div>
            </Link>
            <button className="icon-btn" aria-label={`Duplicate ${r.name}`} onClick={() => duplicateRoster(r.id)}>
              ⧉
            </button>
            <button className="icon-btn" aria-label={`Delete ${r.name}`} onClick={() => deleteRoster(r.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary btn-block" onClick={newList}>
          New list
        </button>
      </div>
    </Screen>
  );
}
