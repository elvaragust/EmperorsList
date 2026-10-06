import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '@/data/db';
import { useRulePopup } from '@/ui/RulePopup';
import { RulesText } from '@/ui/RulesText';

export interface CardInfo {
  name: string;
  kind: string;
  text: string;
  tags: string[];
}

/** Mission-deck card text that the hosted app imports at startup (empty when not available). */
export function useMissionCards(): Map<string, CardInfo> {
  const rows = useLiveQuery(() => db.imported.where('kind').equals('mission').toArray(), []);
  return useMemo(() => new Map((rows ?? []).map((r) => [r.name.toLowerCase(), { name: r.name, kind: r.type ?? '', text: r.text, tags: (r.legend ?? '').split(',').filter(Boolean) }])), [rows]);
}

export function cardTags(cards: Map<string, CardInfo>): Map<string, string[]> {
  return new Map([...cards.values()].map((c) => [c.name, c.tags]));
}

/** What a chosen card does, shown right under the picker. */
export function CardText({ name, cards, compact }: { name?: string; cards: Map<string, CardInfo>; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  if (!name) return null;
  const c = cards.get(name.toLowerCase());
  if (!c) {
    return cards.size ? null : <p className="small muted" style={{ margin: '4px 0 10px' }}>Card text appears here once the app has loaded the mission deck (on the hosted app, at startup).</p>;
  }
  return (
    <div className="card-text">
      <button className="card-text-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong style={{ flex: 1 }}>{c.name}</strong>
        {c.tags.includes('fixed') && <span className="tag">FIXED</span>}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <RulesText text={c.text} />}
    </div>
  );
}

/** Tap a card name to read it in a sheet. */
export function useCardPopup(cards: Map<string, CardInfo>) {
  const popup = useRulePopup();
  return (name: string) => {
    const c = cards.get(name.toLowerCase());
    if (c) popup.openDef({ name: c.name, text: c.text, kind: 'core', source: `Mission deck · ${c.kind} · Wahapedia` }, undefined);
  };
}
