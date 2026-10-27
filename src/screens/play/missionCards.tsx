import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useMemo, useState } from 'react';
import { db } from '@/data/db';
import { useRulePopup } from '@/ui/RulePopup';
import { Icon } from '@/ui/Icon';
import { RulesText } from '@/ui/RulesText';
import { parseCard, scoreItems, scoreTiming, TIMING_NAMES, type ScoreItem, type ScoreTiming } from '@/engine/missionCard';
import type { PrimaryPart } from '@/engine/missions';

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

/** A card's rules without the flavour line it opens with (the lore). */
export function withoutFlavour(text: string): string {
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.trim());
  // The opening line is flavour when it isn't a rule heading, a WHEN line or a scoring line.
  if (first >= 0 && lines.length > 1 && !/^(\*\*)?(when|any|first|second|third|fourth|fifth|end of)/i.test(lines[first]!.trim()) && !/\d+\s*VP/i.test(lines[first]!)) lines.splice(first, 1);
  return lines.join('\n').trim();
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
      {open && <RulesText text={withoutFlavour(c.text)} />}
    </div>
  );
}

/**
 * One mission in a pick list, laid out like a card from the deck: a chevron and
 * the name on the left, the card's emblem on the right. Tapping the name opens
 * the card's rules underneath; tapping the emblem (when `onSelect` is given)
 * picks it. Chosen cards are lit; `tag` says where a card is ("In hand"),
 * and a scored one (`done`) keeps a check without being greyed out.
 */
export function MissionRow({ name, cards, selected, done, tag, dim, onSelect, selectLabel, children }: { name: string; cards: Map<string, CardInfo>; selected?: boolean; done?: boolean; tag?: string; dim?: boolean; onSelect?: () => void; selectLabel?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const c = cards.get(name.toLowerCase());
  const emblem = (
    <span className="mission-emblem" aria-hidden="true">
      {selected || done ? <Icon name="check" size={28} /> : <Icon name="swords" size={30} />}
    </span>
  );
  return (
    <div className={`mission-row ${selected ? 'on' : ''} ${done ? 'done' : ''} ${dim ? 'dim' : ''} ${open ? 'open' : ''}`}>
      <div className="mission-row-head">
        <button className="mission-row-name" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="mission-chev" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
          <span className="mission-title">{name}</span>
          {tag && <span className="mission-tag">{tag}</span>}
        </button>
        {onSelect ? (
          <button className="mission-pick" role="checkbox" aria-checked={Boolean(selected)} aria-label={selectLabel ?? `Choose ${name}`} onClick={onSelect}>
            {emblem}
          </button>
        ) : (
          <span className="mission-pick static">{emblem}</span>
        )}
      </div>
      {open && (
        <div className="mission-row-body">
          {c ? <RulesText text={withoutFlavour(c.text)} /> : <p className="small muted">Card text appears here once the app has loaded the mission deck.</p>}
          {children}
        </div>
      )}
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

/** The part of a round a section is scored in: its timing, per turn for "end of a turn" (see PrimaryPart). */
export const partKey = (timing: ScoreTiming, turnKey: string) => (timing === 'anyTurn' ? `anyTurn@${turnKey}` : timing);

/** At Finish: the primary has END OF THE BATTLE lines that haven't been scored in round 5. */
export function endOfBattleOpen(cards: Map<string, CardInfo>, name: string | undefined, parts: PrimaryPart[] = []): boolean {
  const c = name ? cards.get(name.toLowerCase()) : undefined;
  if (!c) return false;
  return parseCard(c.text).sections.some((s) => s.items.length > 0 && scoreTiming(s, 5) === 'battle') && !parts.some((p) => p.round === 5 && p.part === 'battle');
}

const vpLabel = (it: ScoreItem) => `${it.bonus ? '+' : ''}${it.vp}VP${it.each ? ' each' : ''}${it.cap ? ` · max ${it.cap}` : ''}`;

/**
 * A card laid out for scoring. The whole card is shown: flavour, rules and
 * every battle-round section — the ones that count this round are live, the
 * others dimmed — with a tick or a counter per scoring line, caps applied.
 * "OR" lines are alternatives: ticking one clears the other. Once scored, a
 * card can be shown as done for the round (`done`) and enabled again.
 * With `parts` (the primary) each moment of the round — end of the Command
 * phase, end of turn, end of the battle — has its own Add and locks on its
 * own: its lines stay ticked while the others can still be scored.
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
  parts,
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
  /** Score part by part: what has been scored (any round), this turn's key, and Add / Undo for one part. */
  parts?: {
    scored: PrimaryPart[];
    turnKey: string;
    onAdd?: (part: string, vp: number, counts: Record<number, number[]>, label: string) => void;
    onUndo?: (p: PrimaryPart, label: string) => void;
  };
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
  // The first intro line is flavour text (left out); the rest (WHEN DRAWN, actions) are rules you need while playing.
  const introRules = parsed?.intro.slice(1) ?? [];
  const live = (si: number) => round >= sections[si]!.from && round <= sections[si]!.to;
  const total = sections.reduce((sum, s, si) => sum + (live(si) ? scoreItems(s.items, counts[si] ?? []) : 0), 0);
  const anyLive = sections.some((s, si) => live(si) && s.items.length > 0);
  // Part by part: each live section's part, and that part if already scored this round.
  const timing = (si: number) => scoreTiming(sections[si]!, round);
  const partOf = (si: number) => (parts ? partKey(timing(si), parts.turnKey) : '');
  const scoredPart = (si: number) => (parts && live(si) ? parts.scored.find((p) => p.round === round && p.part === partOf(si)) : undefined);
  // The live parts with something to score, in card order, each with its sections.
  const liveParts: { key: string; label: string; sections: number[] }[] = [];
  if (parts)
    sections.forEach((s, si) => {
      if (!live(si) || !s.items.length) return;
      const found = liveParts.find((p) => p.key === partOf(si));
      if (found) found.sections.push(si);
      else liveParts.push({ key: partOf(si), label: TIMING_NAMES[timing(si)], sections: [si] });
    });
  const allScored = liveParts.length > 0 && liveParts.every((p) => scoredPart(p.sections[0]!));
  // Under the last section of a part: its Add, or once scored, what it gave and Undo.
  const partFooter = (si: number) => {
    const p = liveParts.find((x) => x.sections[x.sections.length - 1] === si);
    if (!p || !parts) return null;
    const got = scoredPart(si);
    if (got)
      return (
        <div className="score-done">
          <span style={{ flex: 1 }}>
            ✓ Scored at {p.label} · +{got.vp} VP
          </span>
          {parts.onUndo && !readOnly && (
            <button
              className="btn btn-sm"
              title="Take these VP off again and tick the lines anew"
              onClick={() => {
                setCounts((all) => ({ ...all, ...got.counts }));
                parts.onUndo!(got, p.label);
              }}
            >
              Undo
            </button>
          )}
        </div>
      );
    if (!parts.onAdd || readOnly || done) return null;
    const vp = p.sections.reduce((sum, x) => sum + scoreItems(sections[x]!.items, counts[x] ?? []), 0);
    return (
      <button
        className="btn btn-primary btn-block score-add"
        disabled={vp <= 0}
        onClick={() => {
          parts.onAdd!(p.key, vp, Object.fromEntries(p.sections.map((x) => [x, counts[x] ?? []])), p.label);
          setCounts((all) => Object.fromEntries(Object.entries(all).filter(([k]) => !p.sections.includes(Number(k)))));
        }}
      >
        {addLabel} {vp} VP · {p.label}
      </button>
    );
  };
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
    <div className={`score-card ${done || allScored ? 'is-done' : ''}`}>
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
          {parsed && sections.length === 0 && <RulesText text={withoutFlavour([...parsed.intro, ...parsed.notes].join('\n') || c!.text)} />}
          {sections.length > 0 && introRules.length > 0 && (
            <div className="card-rules small">
              {introRules.map((l, i) => (
                <RulesText key={i} text={l} />
              ))}
            </div>
          )}
          {sections.map((s, si) => {
            const got = scoredPart(si);
            const now = live(si) && !done && !readOnly && !got;
            return (
              <div key={si} className={`score-section ${now || got ? 'now' : 'later'}`}>
                {!s.cont && (
                  <div className="score-section-head">
                    <span className={`round-pill ${live(si) ? '' : 'dim'}`}>{s.title}</span>
                    {live(si) ? <span className="small now-tag">This round</span> : <span className="small muted">Not in round {round}</span>}
                  </div>
                )}
                {s.when && (
                  <div className="small score-when">
                    <strong>When:</strong> {s.when}
                  </div>
                )}
                {s.items.map((it, i) => {
                  const n = (got ? got.counts?.[si]?.[i] : counts[si]?.[i]) ?? 0;
                  const text = (
                    <span className="score-text">
                      <RulesText inline text={it.text} />
                    </span>
                  );
                  const vp = <span className="vp-chip">{vpLabel(it)}</span>;
                  const or = it.or ? <div className="or-tag">or</div> : null;
                  if (!now) {
                    // A scored part keeps its ticks and counts shown.
                    return (
                      <Fragment key={i}>
                        {or}
                        <div className="score-line static">
                          {text}
                          {vp}
                          {got && (it.each ? <span className="num">×{n}</span> : <span className={`check ${n > 0 ? 'on' : ''}`}>{n > 0 ? '✓' : ''}</span>)}
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
                {partFooter(si)}
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
          {onAdd && !parts && anyLive && !done && (
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
