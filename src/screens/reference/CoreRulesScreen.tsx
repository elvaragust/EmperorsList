import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '@/data/db';
import { useAllIndex } from '@/data/gameData';
import { baseRuleName, isWeaponAbility } from '@/engine/rules/glossary';
import { ruleText } from '@/engine/rules/nodes';
import { PinButton, pinId } from '@/ui/PinButton';
import { RuleLabel } from '@/ui/RuleLabel';
import { RulesText } from '@/ui/RulesText';
import { Screen } from '@/ui/Screen';

/** The Core Rules (from Wahapedia, built into the site) and the core abilities A–Z from the army data. */
export function CoreRulesScreen() {
  const { index } = useAllIndex();
  const core = useLiveQuery(() => db.imported.where('kind').equals('coreRule').toArray(), []);
  const [tab, setTab] = useState<'rules' | 'abilities'>('rules');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const sections = useMemo(
    () =>
      (core ?? [])
        .map((r) => ({ id: r.id, num: r.detachment ?? '', title: r.name, text: r.text }))
        .sort((a, b) => a.num.localeCompare(b.num, undefined, { numeric: true }))
        .filter((s) => !query || s.title.toLowerCase().includes(query) || s.text.toLowerCase().includes(query)),
    [core, query],
  );
  const abilities = useMemo(() => {
    const m = new Map<string, { name: string; text: string }>();
    index?.gameSystem?.sharedRules?.forEach((r) => {
      const text = ruleText(r);
      if (text && !m.has(r.name)) m.set(r.name, { name: r.name, text });
    });
    return [...m.values()].filter((r) => !query || r.name.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
  }, [index, query]);

  const row = (id: string, title: string, sub: string, text: string, kind: 'core' | 'weaponAbility') => (
    <div className="card" key={id} style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button className="choice" style={{ borderTop: 0, flex: 1 }} onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
          <span style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{title}</div>
            {sub && <div className="muted small">{sub}</div>}
          </span>
          <RuleLabel kind={kind} />
        </button>
        <PinButton small pin={{ id: pinId(kind, title), kind, name: title, text, source: sub || 'Core rules' }} />
      </div>
      {open === id && (
        <div style={{ padding: '0 14px 12px' }}>
          <RulesText text={text} index={index} />
        </div>
      )}
    </div>
  );

  return (
    <Screen title="Core rules" back>
      <div className="seg" role="tablist">
        <button className={tab === 'rules' ? 'on' : undefined} onClick={() => setTab('rules')}>
          Core Rules
        </button>
        <button className={tab === 'abilities' ? 'on' : undefined} onClick={() => setTab('abilities')}>
          Abilities A–Z
        </button>
      </div>
      <input className="input" placeholder="Search the core rules" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the core rules" style={{ marginBottom: 10 }} />
      {tab === 'rules' && (
        <>
          {core && core.length === 0 && <p className="muted">The Core Rules haven't loaded on this device yet. They come with the app when it's opened from its website; or import a saved Core Rules page in Settings → Extra rules.</p>}
          {sections.map((s) => row(s.id, s.title, s.num, s.text, 'core'))}
          {core && core.length > 0 && <p className="credit">Powered by Wahapedia.</p>}
        </>
      )}
      {tab === 'abilities' && abilities.map((r) => row(`a-${r.name}`, r.name, '', r.text, isWeaponAbility(baseRuleName(r.name)) ? 'weaponAbility' : 'core'))}
    </Screen>
  );
}
