import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/data/db';
import type { DataIndex } from '@/engine/bsdata/index';
import type { DetachmentOption, EnhancementInfo } from '@/engine/rules/config';
import { stratagemsFor, type ImportedRule } from '@/engine/wahapedia';
import { PinButton, pinId } from './PinButton';
import { RuleLabel } from './RuleLabel';
import { RulesText } from './RulesText';

/**
 * A detachment you can open and read before choosing it: rules, enhancements
 * and (when imported) stratagems. The checkbox is separate from the expander.
 */
export function DetachmentCard({
  d,
  enhancements,
  index,
  selected,
  onToggle,
  note,
}: {
  d: DetachmentOption;
  enhancements: EnhancementInfo[];
  index?: DataIndex;
  selected?: boolean;
  onToggle?: () => void;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const imported = useLiveQuery<ImportedRule[]>(() => (open ? db.imported.toArray() : Promise.resolve([])), [open]);
  const strats = imported ? stratagemsFor(imported, [d.name], []).filter((s) => s.detachment) : [];
  return (
    <div style={{ borderTop: '1px solid var(--line-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {onToggle ? (
          <button className="choice" role="checkbox" aria-checked={Boolean(selected)} onClick={onToggle} style={{ borderTop: 0, flex: 1 }}>
            <span className="mark square" />
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div className="muted small">
                {d.dp} DP{d.dispositions.length ? ` · ${d.dispositions.join(', ')}` : ''}
                {note ? ` · ${note}` : ''}
              </div>
            </span>
          </button>
        ) : (
          <button className="choice" onClick={() => setOpen(!open)} style={{ borderTop: 0, flex: 1 }}>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div className="muted small">
                {d.dp} DP{d.dispositions.length ? ` · ${d.dispositions.join(', ')}` : ''}
              </div>
            </span>
            <RuleLabel kind="detachment" />
          </button>
        )}
        <PinButton
          small
          pin={{ id: pinId('detachment', d.name), kind: 'detachment', name: d.name, text: d.rules.map((r) => `**${r.name}**\n${r.text}`).join('\n\n'), source: `${d.dp} DP` }}
        />
        <button className="icon-btn" aria-expanded={open} aria-label={open ? `Close ${d.name}` : `Read ${d.name}`} onClick={() => setOpen(!open)}>
          <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>▸</span>
        </button>
      </div>
      {open && (
        <div style={{ padding: '0 14px 12px' }} className="small">
          {d.rules.map((r) => (
            <div key={r.name}>
              <strong>{r.name}</strong>
              <RulesText text={r.text} index={index} />
            </div>
          ))}
          {enhancements.length > 0 && <div className="section-label">Enhancements</div>}
          {enhancements.map((e) => (
            <div key={e.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ flex: 1 }}>
                  {e.name} {e.pts ? <span className="muted small">{e.pts} pts</span> : null}
                </strong>
                <PinButton small pin={{ id: pinId('enhancement', e.name), kind: 'enhancement', name: e.name, text: e.text, source: `${d.name}${e.pts ? ` · ${e.pts} pts` : ''}` }} />
              </div>
              <RulesText text={e.text} index={index} />
            </div>
          ))}
          {strats.length > 0 && <div className="section-label">Stratagems · Wahapedia</div>}
          {strats.map((s) => (
            <div key={s.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ flex: 1 }}>
                  {s.name} <span className="muted small">{[s.cp ? `${s.cp}CP` : '', s.type, s.phase].filter(Boolean).join(' · ')}</span>
                </strong>
                <PinButton small pin={{ id: pinId('stratagem', s.name), kind: 'stratagem', name: s.name, text: s.text, source: `${s.cp ?? '?'} CP · ${d.name}` }} />
              </div>
              <RulesText text={s.text} index={index} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
