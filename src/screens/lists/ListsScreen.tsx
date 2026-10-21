import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/data/db';
import { deleteRoster, duplicateRoster } from '@/data/rosters';
import { backupDue, saveBackupFile, snoozeBackup } from '@/data/backup';
import { Screen } from '@/ui/Screen';
import { Loading } from '@/ui/Loading';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { Icon } from '@/ui/Icon';
import { showToast } from '@/ui/Toast';
import { IosInstallBanner } from '@/ui/IosInstallBanner';
import type { Roster } from '@/engine/types';

export function ListsScreen() {
  const rosters = useLiveQuery(() => db.rosters.orderBy('updatedAt').reverse().toArray(), []);
  const [filter, setFilter] = useState('');
  const [menu, setMenu] = useState<Roster | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [showBackup, setShowBackup] = useState(() => backupDue(true));

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
        <Link className="btn btn-sm btn-ghost" to="/import">
          <Icon name="import" size={18} />
          Import
        </Link>
      }
    >
      <IosInstallBanner />
      {rosters && rosters.length > 0 && showBackup && (
        <div className="backup-nudge" role="status">
          <div style={{ fontWeight: 600 }}>Keep your lists safe</div>
          <div className="small muted">They live only in this browser. Save a backup to Drive, Files or email — you can restore it on any phone.</div>
          <div className="btn-row" style={{ margin: '8px 0 0' }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={async () => {
                const how = await saveBackupFile();
                if (how) {
                  setShowBackup(false);
                  showToast(how === 'shared' ? 'Backup saved' : 'Backup downloaded');
                }
              }}
            >
              Save a backup
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => (snoozeBackup(), setShowBackup(false))}>
              Later
            </button>
          </div>
        </div>
      )}
      {rosters && rosters.length > 3 && (
        <input className="input" placeholder="Search lists" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search lists" style={{ marginBottom: 8 }} />
      )}
      {!rosters && <Loading what="your lists" />}
      {rosters && rosters.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">No armies yet</div>
          <p className="muted">Build a list from scratch, or paste one exported from the official Warhammer app.</p>
          <div className="btn-row">
            <Link className="btn btn-primary btn-block" to="/new">
              New list
            </Link>
            <Link className="btn btn-block" to="/import">
              <Icon name="import" size={18} />
              Import a list
            </Link>
          </div>
        </div>
      )}
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
                    <Icon name="more" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {rosters && rosters.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Link className="btn btn-primary btn-block" to="/new">
            New list
          </Link>
        </div>
      )}
      <Sheet open={Boolean(menu) && !confirm} onClose={() => setMenu(null)} title={menu?.name}>
        {menu && (
          <>
            <Link className="menu-item" to={`/roster/${menu.id}`}>
              Open
            </Link>
            <Link className="menu-item" to={`/play/new?roster=${menu.id}`}>
              Start a game with it
            </Link>
            <button className="menu-item" onClick={() => (duplicateRoster(menu.id), setMenu(null), showToast(`Copied “${menu.name}”`))}>
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
            <button className="menu-item btn-danger" onClick={() => setConfirm(true)}>
              Delete…
            </button>
          </>
        )}
      </Sheet>
      <ConfirmSheet
        open={confirm && Boolean(menu)}
        onClose={() => setConfirm(false)}
        title={`Delete “${menu?.name}”?`}
        message="The list is removed from this device. Games already played with it keep their results."
        confirm="Delete list"
        danger
        onConfirm={() => {
          if (menu) void deleteRoster(menu.id).then(() => showToast('List deleted'));
          setMenu(null);
        }}
      />
    </Screen>
  );
}
