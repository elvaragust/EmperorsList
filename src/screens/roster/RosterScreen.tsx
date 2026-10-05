import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { useFactionTheme } from '@/theme/themes';
import { Screen } from '@/ui/Screen';
import { validateRoster } from '@/engine/validate';

export function RosterScreen() {
  const { id = '' } = useParams();
  const roster = useLiveQuery(() => db.rosters.get(id), [id]);
  useFactionTheme(roster?.factionName);
  if (!roster) return <Screen title="Roster" back>{null}</Screen>;

  const total = roster.units.reduce((s, u) => s + u.points, 0);
  const issues = validateRoster(roster, () => 0);

  return (
    <Screen title={roster.name} back>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="num" style={{ fontSize: 28 }}>{total.toLocaleString('en')}</span>
        <span className="muted">/ {roster.pointsLimit.toLocaleString('en')} pts</span>
        <span className="small" style={{ marginLeft: 'auto', color: issues.length ? 'var(--danger)' : 'var(--ok)' }}>
          {issues.length ? `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}` : 'Valid'}
        </span>
      </div>
      <div className="section-label">Units</div>
      <div className="card">
        <Link className="row" to="/unit/demo">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Sample squad from your sketch</div>
            <div className="muted small">Opens the weapon grid demo</div>
          </div>
        </Link>
      </div>
      {issues.length > 0 && (
        <>
          <div className="section-label">Issues</div>
          <div className="card">
            {issues.map((i) => (
              <div className="row" key={i.title}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--danger)' }}>{i.title}</div>
                  <div className="small">{i.why}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}
