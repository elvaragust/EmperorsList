import { useMemo, useState } from 'react';
import { useAllIndex } from '@/data/gameData';
import { baseRuleName, isWeaponAbility } from '@/engine/rules/glossary';
import { ruleText } from '@/engine/rules/nodes';
import { RuleLabel } from '@/ui/RuleLabel';
import { RulesText } from '@/ui/RulesText';
import { Screen } from '@/ui/Screen';

/** The game system's shared rules (core abilities, weapon abilities) A–Z. */
export function CoreRulesScreen() {
  const { index } = useAllIndex();
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const rules = useMemo(() => {
    const gst = index?.gameSystem;
    const m = new Map<string, { name: string; text: string }>();
    gst?.sharedRules?.forEach((r) => {
      const text = ruleText(r);
      if (text && !m.has(r.name)) m.set(r.name, { name: r.name, text });
    });
    return [...m.values()].filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  }, [index, q]);
  let letter = '';
  return (
    <Screen title="Core rules" back>
      <input className="input" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter rules" />
      <p className="muted small">The rules the community data includes. The full core rules are in the Warhammer 40,000 Core Book.</p>
      {rules.map((r) => {
        const first = r.name[0]!.toUpperCase();
        const head = first !== letter ? ((letter = first), <div className="section-label">{first}</div>) : null;
        return (
          <div key={r.name}>
            {head}
            <div className="card" style={{ marginBottom: 6 }}>
              <button className="choice" onClick={() => setOpen(open === r.name ? null : r.name)} aria-expanded={open === r.name}>
                <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
                <RuleLabel kind={isWeaponAbility(baseRuleName(r.name)) ? 'weaponAbility' : 'core'} />
              </button>
              {open === r.name && (
                <div style={{ padding: '0 14px 12px' }}>
                  <RulesText text={r.text} index={index} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </Screen>
  );
}
