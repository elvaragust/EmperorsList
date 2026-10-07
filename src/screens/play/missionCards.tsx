import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '@/data/db';
import { useRulePopup } from '@/ui/RulePopup';
import { RulesText } from '@/ui/RulesText';
import { parseCard, scoreItems, sectionsFor } from '@/engine/missionCard';

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

/**
 * A card laid out for scoring: the part for this battle round first (when to
 * score, a tick or a counter per scoring line, caps applied), the add-to-score
 * button, and the rest folded away.
 */
export function ScoreCard({
  name,
  cards,
  round,
  onAdd,
  addLabel = 'Add',
  footer,
}: {
  name: string;
  cards: Map<string, CardInfo>;
  round: number;
  onAdd?: (vp: number) => void;
  addLabel?: string;
  footer?: React.ReactNode;
}) {
  const c = cards.get(name.toLowerCase());
  const parsed = useMemo(() => (c ? parseCard(c.text) : undefined), [c]);
  const [counts, setCounts] = useState<Record<string, number[]>>({});
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(true);
  // The first intro line is flavour text; the rest (WHEN DRAWN, actions) are rules you need while playing.
  const flavour = parsed?.intro.slice(0, 1) ?? [];
  const introRules = parsed?.intro.slice(1) ?? [];
  const now = parsed ? sectionsFor(parsed, round) : [];
  const later = parsed ? parsed.sections.filter((s) => !now.includes(s)) : [];
  const total = now.reduce((sum, s) => sum + scoreItems(s.items, counts[s.title] ?? []), 0);
  const setCount = (title: string, i: number, n: number) => setCounts((all) => {
    const list = [...(all[title] ?? [])];
    list[i] = Math.max(0, n);
    return { ...all, [title]: list };
  });
  return (
    <div className={`score-card ${open ? '' : 'closed'}`}>
      <button className="score-card-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong style={{ flex: 1, textAlign: 'left' }}>{name}</strong>
        {c?.tags.includes('fixed') && <span className="tag">FIXED</span>}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
      <>
      {!c && <p className="small muted" style={{ margin: '4px 0' }}>Card text not loaded on this device.</p>}
      {parsed && parsed.sections.length === 0 && <RulesText text={[...introRules, ...parsed.notes].join('\n') || c!.text} />}
      {parsed && parsed.sections.length > 0 && introRules.length > 0 && (
        <div className="card-rules small">
          {introRules.map((l, i) => (
            <RulesText key={i} text={l} />
          ))}
        </div>
      )}
      {now.map((s) => (
        <div key={s.title} className="score-section">
          <div className="round-pill">{s.title}</div>
          {s.when && (
            <div className="small">
              <strong>When:</strong> {s.when}
            </div>
          )}
          {s.lines.map((l, i) => (
            <RulesText key={i} text={l} />
          ))}
          {s.items.map((it, i) => {
            const n = counts[s.title]?.[i] ?? 0;
            const label = (
              <span style={{ flex: 1 }}>
                <RulesText inline text={it.text} />
                <span className="vp">
                  {it.bonus ? '+' : ''}
                  {it.vp}VP{it.each ? ' each' : ''}
                  {it.cap ? ` (max ${it.cap})` : ''}
                </span>
              </span>
            );
            return it.each ? (
              <div key={i} className="score-line">
                {label}
                <span className="wounds">
                  <button className="btn btn-sm" onClick={() => setCount(s.title, i, n - 1)} aria-label="One fewer">
                    −
                  </button>
                  <span className="num">{n}</span>
                  <button className="btn btn-sm" onClick={() => setCount(s.title, i, n + 1)} aria-label="One more">
                    +
                  </button>
                </span>
              </div>
            ) : (
              <button key={i} className="score-line" role="checkbox" aria-checked={n > 0} onClick={() => setCount(s.title, i, n > 0 ? 0 : 1)}>
                {label}
                <span className={`check ${n > 0 ? 'on' : ''}`}>{n > 0 ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
      ))}
      {parsed && parsed.sections.length > 0 && now.length === 0 && <p className="small muted">Nothing to score on this card in round {round}.</p>}
      {onAdd && now.some((s) => s.items.length) && (
        <button
          className="btn btn-sm btn-primary btn-block"
          disabled={total <= 0}
          onClick={() => {
            onAdd(total);
            setCounts({});
          }}
        >
          {addLabel} {total} VP
        </button>
      )}
      {footer}
      </>
      )}
      {open && parsed && (flavour.length > 0 || later.length > 0) && (
        <button className="link-btn small" onClick={() => setMore(!more)} aria-expanded={more}>
          {more ? 'Hide' : 'Show'} the rest of the card {more ? '▴' : '▾'}
        </button>
      )}
      {open && more && parsed && (
        <div className="small muted">
          {flavour.map((l, i) => (
            <RulesText key={i} text={l} />
          ))}
          {later.map((s) => (
            <div key={s.title} style={{ marginTop: 6 }}>
              <div className="round-pill dim">{s.title}</div>
              {s.when && <div>When: {s.when}</div>}
              {[...s.lines, ...s.items.map((it) => `${it.bonus ? '+' : ''}${it.text} — ${it.vp}VP${it.cap ? ` (max ${it.cap})` : ''}`)].map((l, i) => (
                <RulesText key={i} text={l} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
