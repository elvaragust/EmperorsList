import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useMemo, useState } from 'react';
import { db } from '@/data/db';
import { useRulePopup } from '@/ui/RulePopup';
import { RulesText } from '@/ui/RulesText';
import { parseCard, scoreItems, type ScoreItem } from '@/engine/missionCard';

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

const vpLabel = (it: ScoreItem) => `${it.bonus ? '+' : ''}${it.vp}VP${it.each ? ' each' : ''}${it.cap ? ` · max ${it.cap}` : ''}`;

/**
 * A card laid out for scoring. The whole card is shown: flavour, rules and
 * every battle-round section — the ones that count this round are live, the
 * others dimmed — with a tick or a counter per scoring line, caps applied.
 * "OR" lines are alternatives: ticking one clears the other. Once scored, a
 * card can be shown as done for the round (`done`) and enabled again.
 */
export function ScoreCard({
  name,
  cards,
  round,
  onAdd,
  addLabel = 'Add',
  footer,
  mode,
  kind,
  done,
  onEnable,
  readOnly,
}: {
  mode?: 'fixed' | 'tactical';
  name: string;
  cards: Map<string, CardInfo>;
  round: number;
  onAdd?: (vp: number) => void;
  addLabel?: string;
  footer?: React.ReactNode;
  /** Shown as a chip in the head: "Primary", "Secondary", "Twist". */
  kind?: string;
  /** Already scored this round (e.g. "+7 VP scored in round 2"): its lines are locked until enabled again. */
  done?: string;
  onEnable?: () => void;
  /** Someone else's card: shown, not ticked. */
  readOnly?: boolean;
}) {
  const c = cards.get(name.toLowerCase());
  const parsed = useMemo(() => {
    if (!c) return undefined;
    const p = parseCard(c.text);
    // Lines tagged FIXED / TACTICAL only count in that mode.
    if (mode) p.sections = p.sections.map((s) => ({ ...s, items: s.items.filter((it) => !it.mode || it.mode === mode) }));
    return p;
  }, [c, mode]);
  // Ticks and counters per section (by position: two sections can have the same heading).
  const [counts, setCounts] = useState<Record<number, number[]>>({});
  const [open, setOpen] = useState(true);
  const sections = parsed?.sections ?? [];
  // The first intro line is flavour text; the rest (WHEN DRAWN, actions) are rules you need while playing.
  const flavour = parsed?.intro.slice(0, 1) ?? [];
  const introRules = parsed?.intro.slice(1) ?? [];
  const live = (si: number) => round >= sections[si]!.from && round <= sections[si]!.to;
  const total = sections.reduce((sum, s, si) => sum + (live(si) ? scoreItems(s.items, counts[si] ?? []) : 0), 0);
  const anyLive = sections.some((s, si) => live(si) && s.items.length > 0);
  const setCount = (si: number, i: number, n: number) =>
    setCounts((all) => {
      const items = sections[si]!.items;
      const list = [...(all[si] ?? [])];
      if (n > 0) {
        // A line and its "OR" alternatives: only one of them scores.
        let start = i;
        while (start > 0 && items[start]!.or) start--;
        let end = start + 1;
        while (end < items.length && items[end]!.or) end++;
        if (end - start > 1) for (let k = start; k < end; k++) if (k !== i) list[k] = 0;
      }
      list[i] = Math.max(0, n);
      return { ...all, [si]: list };
    });
  return (
    <div className={`score-card ${done ? 'is-done' : ''}`}>
      <button className="score-card-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {kind && <span className="card-kind">{kind}</span>}
        <strong className="score-card-name">{name}</strong>
        {c?.tags.includes('fixed') && <span className="tag">FIXED</span>}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {done && (
        <div className="score-done">
          <span style={{ flex: 1 }}>✓ {done}</span>
          {onEnable && (
            <button className="btn btn-sm" onClick={onEnable}>
              Enable again
            </button>
          )}
        </div>
      )}
      {open && (
        <>
          {!c && <p className="small muted" style={{ margin: '4px 0' }}>Card text not loaded on this device.</p>}
          {parsed && sections.length === 0 && <RulesText text={[...parsed.intro, ...parsed.notes].join('\n') || c!.text} />}
          {sections.length > 0 && flavour.length > 0 && (
            <div className="card-flavour">
              {flavour.map((l, i) => (
                <RulesText key={i} text={l} />
              ))}
            </div>
          )}
          {sections.length > 0 && introRules.length > 0 && (
            <div className="card-rules small">
              {introRules.map((l, i) => (
                <RulesText key={i} text={l} />
              ))}
            </div>
          )}
          {sections.map((s, si) => {
            const now = live(si) && !done && !readOnly;
            return (
              <div key={si} className={`score-section ${now ? 'now' : 'later'}`}>
                <div className="score-section-head">
                  <span className={`round-pill ${live(si) ? '' : 'dim'}`}>{s.title}</span>
                  {live(si) ? <span className="small now-tag">This round</span> : <span className="small muted">Not in round {round}</span>}
                </div>
                {s.when && (
                  <div className="small score-when">
                    <strong>When:</strong> {s.when}
                  </div>
                )}
                {s.items.map((it, i) => {
                  const n = counts[si]?.[i] ?? 0;
                  const text = (
                    <span className="score-text">
                      <RulesText inline text={it.text} />
                    </span>
                  );
                  const vp = <span className="vp-chip">{vpLabel(it)}</span>;
                  const or = it.or ? <div className="or-tag">or</div> : null;
                  if (!now) {
                    return (
                      <Fragment key={i}>
                        {or}
                        <div className="score-line static">
                          {text}
                          {vp}
                        </div>
                      </Fragment>
                    );
                  }
                  return (
                    <Fragment key={i}>
                      {or}
                      {it.each ? (
                        <div className="score-line">
                          {text}
                          {vp}
                          <span className="wounds">
                            <button className="btn btn-sm" onClick={() => setCount(si, i, n - 1)} aria-label="One fewer">
                              −
                            </button>
                            <span className="num">{n}</span>
                            <button className="btn btn-sm" onClick={() => setCount(si, i, n + 1)} aria-label="One more">
                              +
                            </button>
                          </span>
                        </div>
                      ) : (
                        <button className="score-line" role="checkbox" aria-checked={n > 0} onClick={() => setCount(si, i, n > 0 ? 0 : 1)}>
                          {text}
                          {vp}
                          <span className={`check ${n > 0 ? 'on' : ''}`}>{n > 0 ? '✓' : ''}</span>
                        </button>
                      )}
                    </Fragment>
                  );
                })}
                {s.lines.length > 0 && (
                  <div className="card-rules small">
                    {s.lines.map((l, i) => (
                      <RulesText key={i} text={l} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {sections.length > 0 && (parsed?.notes.length ?? 0) > 0 && (
            <div className="card-rules small">
              {parsed!.notes.map((l, i) => (
                <RulesText key={i} text={l} />
              ))}
            </div>
          )}
          {sections.length > 0 && !anyLive && <p className="small muted">Nothing to score on this card in round {round}.</p>}
          {onAdd && anyLive && !done && (
            <button
              className="btn btn-primary btn-block score-add"
              disabled={total <= 0}
              onClick={() => {
                onAdd(total);
                setCounts({});
              }}
            >
              {addLabel} {total} VP
            </button>
          )}
        </>
      )}
      {footer}
    </div>
  );
}
