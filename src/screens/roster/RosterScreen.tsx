import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { saveRoster, useRosterEngine } from '@/data/gameData';
import { deleteRoster, duplicateRoster } from '@/data/rosters';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import { ROLES, roleOfCategory, unitRole, type Role } from '@/engine/rules/roles';
import type { Roster, RosterUnit } from '@/engine/types';
import { useFactionTheme } from '@/theme/themes';
import { Screen } from '@/ui/Screen';
import { Loading } from '@/ui/Loading';
import { Sheet } from '@/ui/Sheet';

const roleOf = (engine: RosterEngine | undefined, u: RosterUnit): Role =>
  engine ? unitRole(engine, u.id, u.primaryCategory) : roleOfCategory('');

export function RosterScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const roster = useLiveQuery(() => db.rosters.get(id), [id]);
  const { engine, index, error } = useRosterEngine(roster);
  useFactionTheme(roster?.factionName);
  const [showIssues, setShowIssues] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const issues = useMemo(() => engine?.issues() ?? [], [engine]);
  const fileCommit = useLiveQuery(() => (roster ? db.dataMeta.where('catalogueId').equals(roster.catalogueId).first() : undefined), [roster?.catalogueId])?.commit;
  const sections = useMemo(() => {
    if (!roster) return [];
    const led = new Set(roster.units.filter((u) => u.leaderOf && roster.units.some((b) => b.id === u.leaderOf)).map((u) => u.id));
    const m = new Map<string, RosterUnit[]>();
    roster.units.filter((u) => !led.has(u.id)).forEach((u) => {
      const role = roleOf(engine, u);
      m.set(role, [...(m.get(role) ?? []), u]);
    });
    // Every section is shown (like the official app), each with its own +.
    return ROLES.map((r) => [r, m.get(r) ?? []] as const);
  }, [roster, engine]);

  if (!roster) return <Screen title="Roster" back><Loading what="the list" /></Screen>;

  const update = (fn: (r: Roster) => Roster) => saveRoster(index, fn(roster));
  const total = engine?.totalPoints() ?? roster.units.reduce((s, u) => s + u.points, 0);
  const limit = engine?.pointsLimit() ?? roster.pointsLimit;
  const dp = engine?.detachmentPoints();
  const enh = engine?.enhancements();
  const errors = issues.filter((i) => i.severity === 'error');

  const unitLine = (u: RosterUnit, isLed = false) => {
    const attached = roster.units.filter((x) => x.leaderOf === u.id);
    const pts = engine?.unitPoints(u.id) ?? u.points;
    const combined = attached.reduce((s, a) => s + (engine?.unitPoints(a.id) ?? a.points), pts);
    const warlord = engine?.isWarlord(u.id);
    const enhancement = engine?.enhancementOf(u.id);
    const unitIssues = issues.filter((i) => i.unitId === u.id).length;
    return (
      <div key={u.id}>
        <NavLink className={({ isActive }) => `unit-row ${isLed ? 'led' : ''}${isActive ? ' active' : ''}`} to={`/roster/${roster.id}/unit/${u.id}`}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 17 }}>
              {u.nickname || u.name}
              {warlord && <span className="tag" style={{ marginLeft: 8 }}>WARLORD</span>}
            </div>
            <div className="muted small">
              {[
                enhancement ? engine?.ev.name(enhancement) : '',
                attached.length ? `+ ${attached.map((a) => a.nickname || a.name).join(', ')} · ${combined} pts together` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {unitIssues > 0 && <div className="small issue-title">{unitIssues === 1 ? '1 issue' : `${unitIssues} issues`}</div>}
          </div>
          <span className="pts">{pts}</span>
        </NavLink>
        {attached.map((a) => unitLine(a, true))}
      </div>
    );
  };

  return (
    <Screen
      title={roster.name}
      back
      actions={
        <button className="icon-btn" aria-label="List menu" onClick={() => setMenu(true)}>
          ⋯
        </button>
      }
    >
      {error && <p className="issue-title">{error} Open Settings → Data to download it.</p>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="big-num">{total.toLocaleString('en')}</span>
        <span className="muted">/ {limit.toLocaleString('en')} pts</span>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost" onClick={() => setShowIssues((s) => !s)} style={{ color: errors.length ? 'var(--danger)' : 'var(--ok)' }} disabled={!engine}>
          {!engine ? '…' : errors.length ? `${errors.length} ${errors.length === 1 ? 'issue' : 'issues'}` : 'Valid'}
        </button>
      </div>
      <div className={`meter ${total > limit ? 'over' : ''}`}>
        <div style={{ width: `${Math.min(100, (total / Math.max(limit, 1)) * 100)}%` }} />
      </div>
      <Link to={`/roster/${roster.id}/army`} className="small" style={{ display: 'block', marginTop: 8 }}>
        <span className="muted">
          {roster.detachmentNames?.join(' + ') || 'No detachment'}
          {roster.forceDisposition ? ` · ${roster.forceDisposition}` : ''}
          {dp ? ` · ${dp.used}/${dp.max ?? '–'} DP` : ''}
          {enh ? ` · ${enh.used}/${enh.max ?? '–'} Enhancements` : ''}
        </span>{' '}
        <span className="tag">EDIT</span>
      </Link>

      {fileCommit && roster.dataCommit && fileCommit !== roster.dataCommit && (
        <div className="card row small" style={{ marginTop: 10 }}>
          <span style={{ flex: 1 }}>
            The game data was updated since this list was built ({roster.dataCommit.slice(0, 7)} → {fileCommit.slice(0, 7)}). Points and issues above use the new data.
          </span>
          <button className="btn btn-sm" onClick={() => update((r) => ({ ...r, dataCommit: fileCommit }))}>
            OK
          </button>
        </div>
      )}
      {showIssues && issues.length > 0 && (
        <>
          <div className="section-label">Issues</div>
          <div className="card">
            {issues.map((i, k) => (
              <div className="row" key={k} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div className={i.severity === 'error' ? 'issue-title' : 'advice-title'}>{i.title}</div>
                  <div className="small">{i.why}</div>
                </div>
                {i.unitId && (
                  <Link className="btn btn-sm" to={`/roster/${roster.id}/unit/${i.unitId}`}>
                    {i.fix ?? 'Open'}
                  </Link>
                )}
                {!i.unitId && i.fix && /detachment/i.test(i.fix) && (
                  <Link className="btn btn-sm" to={`/roster/${roster.id}/army`}>
                    {i.fix}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="role-grid">
      {sections.map(([role, list]) => {
        const pts = list.reduce((s, u) => s + (engine?.unitPoints(u.id) ?? u.points) + roster.units.filter((a) => a.leaderOf === u.id).reduce((t, a) => t + (engine?.unitPoints(a.id) ?? a.points), 0), 0);
        return (
          <div key={role}>
            <div className="role-head">
              <span style={{ flex: 1 }}>{role}</span>
              {list.length > 0 && <span className="num small">{pts.toLocaleString('en')} pts</span>}
              <Link className="role-add" to={`/roster/${roster.id}/add?role=${encodeURIComponent(role)}`} aria-label={`Add ${role.toLowerCase()}`}>
                +
              </Link>
            </div>
            {list.length > 0 && <div className="card">{list.map((u) => unitLine(u))}</div>}
          </div>
        );
      })}
      </div>
      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-primary btn-block" to={`/roster/${roster.id}/add`}>
          Add unit
        </Link>
      </div>

      <Sheet open={menu} onClose={() => (setMenu(false), setRename(null), setConfirmDelete(false))} title={roster.name}>
        {rename === null ? (
          <button className="menu-item" onClick={() => setRename(roster.name)}>
            Rename
          </button>
        ) : (
          <div className="btn-row">
            <input className="input" value={rename} onChange={(e) => setRename(e.target.value)} aria-label="List name" autoFocus />
            <button className="btn btn-primary btn-block" onClick={() => (update((r) => ({ ...r, name: rename.trim() || r.name })), setRename(null))}>
              Save name
            </button>
          </div>
        )}
        <Link className="menu-item" to={`/roster/${roster.id}/army`}>
          Battle size, detachments, disposition
        </Link>
        <Link className="menu-item" to={`/play/new?roster=${roster.id}`}>
          Start a game with this list
        </Link>
        <Link className="menu-item" to={`/roster/${roster.id}/export`}>
          Export text / share link / QR
        </Link>
        <Link className="menu-item" to="/reference/pinned">
          Pinned rules and stratagems
        </Link>
        <Link className="menu-item" to={`/roster/${roster.id}/print`}>
          Print datacards
        </Link>
        <Link className="menu-item" to={`/collection?roster=${roster.id}`}>
          Can I field this from my collection?
        </Link>
        <button
          className="menu-item"
          onClick={async () => {
            const copy = await duplicateRoster(roster.id);
            setMenu(false);
            if (copy) navigate(`/roster/${copy}`);
          }}
        >
          Duplicate list
        </button>
        {!confirmDelete ? (
          <button className="menu-item btn-danger" onClick={() => setConfirmDelete(true)}>
            Delete list
          </button>
        ) : (
          <button className="menu-item btn-danger" onClick={() => (deleteRoster(roster.id), navigate('/lists', { replace: true }))}>
            Tap again to delete for good
          </button>
        )}
      </Sheet>
    </Screen>
  );
}
