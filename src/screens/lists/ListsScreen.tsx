import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/data/db';
import { deleteRoster, duplicateRoster } from '@/data/rosters';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import type { Roster } from '@/engine/types';

export function ListsScreen() {
  const rosters = useLiveQuery(() => db.rosters.orderBy('updatedAt').reverse().toArray(), []);
  const [filter, setFilter] = useState('');
  const [menu, setMenu] = useState<Roster | null>(null);
  const [confirm, setConfirm] = useState(false);

  const folders = useMemo(() => {
    const m = new Map<string, Roster[]>();
    rosters
      ?.filter((r) => !filter || `${r.name} ${r.factionName} ${r.folder ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
      .forEach((r) => m.set(r.folder ?? '', [...(m.get(r.folder ?? '') ?? []), r]));
    return [...m.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  }, [rosters, filter]);

  return (
    <Screen
      title="Armies"
      actions={
        <Link className="icon-btn" to="/import" aria-label="Import a list" title="Import a list">
          ⇣
        </Link>
      }
    >
      {rosters && rosters.length > 3 && (
        <input className="input" placeholder="Search lists" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search lists" style={{ marginBottom: 8 }} />
      )}
      {rosters && rosters.length === 0 && <p className="muted">No lists yet. Create as many as you like.</p>}
      {folders.map(([folder, list]) => (
        <div key={folder || 'none'}>
          {folder && <div className="section-label">{folder}</div>}
          <div className="card" style={{ marginTop: folder ? 0 : 8 }}>
            {list.map((r) => {
              const pts = r.units.reduce((s, u) => s + (u.points || 0), 0);
              return (
                <div className="row" key={r.id}>
                  <Link to={`/roster/${r.id}`} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 18 }}>{r.name}</div>
                    <div className="muted small">
                      {r.factionName} · {pts.toLocaleString('en')} / {r.pointsLimit.toLocaleString('en')} pts
                      {r.detachmentNames?.length ? ` · ${r.detachmentNames.join(', ')}` : ''}
                    </div>
                  </Link>
                  <button className="icon-btn" aria-label={`More for ${r.name}`} onClick={() => setMenu(r)}>
                    ⋯
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-primary btn-block" to="/new">
          New list
        </Link>
      </div>
      <Sheet open={Boolean(menu)} onClose={() => (setMenu(null), setConfirm(false))} title={menu?.name}>
        {menu && (
          <>
            <button className="menu-item" onClick={() => (duplicateRoster(menu.id), setMenu(null))}>
              Duplicate
            </button>
            <label className="field">
              <span>Folder</span>
              <input
                className="input"
                defaultValue={menu.folder ?? ''}
                placeholder="No folder"
                onBlur={(e) => db.rosters.put({ ...menu, folder: e.target.value.trim() || undefined })}
              />
            </label>
            {!confirm ? (
              <button className="menu-item btn-danger" onClick={() => setConfirm(true)}>
                Delete
              </button>
            ) : (
              <button className="menu-item btn-danger" onClick={() => (deleteRoster(menu.id), setMenu(null), setConfirm(false))}>
                Tap again to delete “{menu.name}”
              </button>
            )}
          </>
        )}
      </Sheet>
    </Screen>
  );
}
