import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { useAllIndex } from '@/data/gameData';
import { PinButton } from '@/ui/PinButton';
import { RuleLabel } from '@/ui/RuleLabel';
import { useRulePopup } from '@/ui/RulePopup';
import { Screen } from '@/ui/Screen';

/** Everything you've pinned, newest first. */
export function PinnedScreen() {
  const navigate = useNavigate();
  const popup = useRulePopup();
  const { index } = useAllIndex();
  const pins = useLiveQuery(() => db.pins.orderBy('createdAt').reverse().toArray(), []);
  return (
    <Screen title="Pinned" back>
      {pins?.length === 0 && <p className="muted">Nothing pinned yet. Tap the ★ on a unit, stratagem, enhancement, detachment or rule to keep it here.</p>}
      <div className="card">
        {pins?.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--line-soft)' }}>
            <button
              className="choice"
              style={{ borderTop: 0, flex: 1 }}
              onClick={() => (p.route ? navigate(p.route) : popup.openDef({ name: p.name, text: p.text ?? '', kind: p.kind, source: p.source ?? '' }, index))}
            >
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                {p.source && <div className="muted small">{p.source}</div>}
              </span>
              <RuleLabel kind={p.kind} />
            </button>
            <PinButton small pin={p} />
          </div>
        ))}
      </div>
      <p className="small muted">Pinned stratagems are listed first during a game; other pins show in the phase panel.</p>
    </Screen>
  );
}
