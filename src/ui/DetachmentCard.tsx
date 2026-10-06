import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/data/db';
import type { DataIndex } from '@/engine/bsdata/index';
import type { DetachmentOption, EnhancementInfo } from '@/engine/rules/config';
import { stratagemsFor, type ImportedRule } from '@/engine/wahapedia';
import { PinButton, pinId } from './PinButton';
import { RuleLabel } from './RuleLabel';
import { RulesText } from './RulesText';
import { Collapse } from './Collapse';

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
  const imported = useLiveQuery<ImportedRule[]>(() => (open ? db.imported.where('kind').equals('stratagem').toArray() : Promise.resolve([])), [open]);
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
        <div style={{ padding: '0 14px 8px' }} className="small">
          <Collapse tone="plain" title={`Rules (${d.rules.length})`} defaultOpen>
            {d.rules.map((r) => (
              <div key={r.name} style={{ marginBottom: 8 }}>
                <strong>{r.name}</strong>
                <RulesText text={r.text} index={index} />
              </div>
            ))}
          </Collapse>
          {enhancements.length > 0 && (
            <Collapse tone="plain" title={`Enhancements (${enhancements.length})`}>
              {enhancements.map((e) => (
                <Collapse
                  key={e.id}
                  tone="plain"
                  title={
                    <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text)', fontSize: 14 }}>
                      {e.name} {e.pts ? <span className="muted">· {e.pts} pts</span> : null}
                    </span>
                  }
                  right={<PinButton small pin={{ id: pinId('enhancement', e.name), kind: 'enhancement', name: e.name, text: e.text, source: `${d.name}${e.pts ? ` · ${e.pts} pts` : ''}` }} />}
                >
                  <RulesText text={e.text} index={index} />
                </Collapse>
              ))}
            </Collapse>
          )}
          {strats.length > 0 && (
            <Collapse tone="plain" title={`Stratagems (${strats.length}) · Wahapedia`}>
              {strats.map((st) => (
                <Collapse
                  key={st.id}
                  tone="plain"
                  title={
                    <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text)', fontSize: 14 }}>
                      {st.name} <span className="muted">· {st.cp ?? '0'} CP{st.phase ? ` · ${st.phase}` : ''}</span>
                    </span>
                  }
                  right={<PinButton small pin={{ id: pinId('stratagem', st.name), kind: 'stratagem', name: st.name, text: st.text, source: `${st.cp ?? '0'} CP · ${d.name}` }} />}
                >
                  <RulesText text={st.text} index={index} />
                </Collapse>
              ))}
            </Collapse>
          )}
        </div>
      )}
    </div>
  );
}
