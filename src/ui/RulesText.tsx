import { Fragment, type ReactNode } from 'react';
import type { DataIndex } from '@/engine/bsdata/index';
import { lookupRule, termMatcher } from '@/engine/rules/glossary';
import { useRulePopup } from './RulePopup';

/**
 * Renders BSData rules markup: ^^**KEYWORD**^^, **bold**, [WEAPON ABILITY].
 * Anything that has a definition in the data becomes tappable.
 */
export function RulesText({ text, index, inline }: { text: string; index?: DataIndex; inline?: boolean }) {
  const popup = useRulePopup();
  // Keywords written bold-and-keyword (**^^X^^** or ^^**X**^^) are just keywords.
  const paragraphs = text
    .replace(/\r/g, '')
    // (the data sometimes nests them wrongly: ^^**X^^**)
    .replace(/(\*\*\^\^|\^\^\*\*)(.+?)(\*\*\^\^|\^\^\*\*)/g, '^^$2^^')
    .split(/\n{2,}/);
  const matcher = index ? termMatcher(index) : undefined;
  /** Plain text with known rule names and core terms made tappable (e.g. "surge move", "Deep Strike"). */
  const linkify = (chunk: string, key: string): ReactNode[] => {
    const re = matcher?.re;
    if (!re || !chunk) return [chunk];
    const parts: ReactNode[] = [];
    let at = 0;
    let n = 0;
    re.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(chunk))) {
      if (mm.index > at) parts.push(chunk.slice(at, mm.index));
      const word = mm[0];
      parts.push(
        <button key={`${key}-t${n++}`} className="kw kw-soft" onClick={() => popup.openTerm(matcher!.canonical.get(word.toLowerCase()) ?? word, index)}>
          {word}
        </button>,
      );
      at = mm.index + word.length;
    }
    if (at < chunk.length) parts.push(chunk.slice(at));
    return parts;
  };
  const render = (para: string, pi: number) => {
    const out: ReactNode[] = [];
    const re = /\^\^\*\*(.+?)\*\*\^\^|\^\^(.+?)\^\^|\*\*(.+?)\*\*|\[([A-Z][A-Z0-9 +\-"']+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(para))) {
      if (m.index > last) out.push(...linkify(para.slice(last, m.index), `${pi}-${k++}`));
      const kw = m[1] ?? m[2];
      const bold = m[3];
      const ability = m[4];
      const term = (kw ?? bold ?? ability ?? '').replace(/\*\*|\^\^/g, '').trim();
      const known = index ? Boolean(lookupRule(index, term)) : false;
      const cls = kw || ability ? 'kw-upper' : undefined;
      const label = ability ? `[${term}]` : term;
      if (known) {
        out.push(
          <button key={`${pi}-${k++}`} className={`kw ${cls ?? ''}`} style={bold ? { fontWeight: 700 } : undefined} onClick={() => popup.openTerm(term, index)}>
            {label}
          </button>,
        );
      } else if (bold) {
        out.push(<strong key={`${pi}-${k++}`}>{term}</strong>);
      } else {
        out.push(
          <span key={`${pi}-${k++}`} className={cls}>
            {label}
          </span>,
        );
      }
      last = m.index + m[0].length;
    }
    if (last < para.length) out.push(...linkify(para.slice(last), `${pi}-end`));
    return out;
  };
  if (inline) return <>{paragraphs.map((p, i) => <Fragment key={i}>{render(p, i)}</Fragment>)}</>;
  return (
    <div className="rules-text">
      {paragraphs.map((p, i) => (
        <p key={i}>{render(p.trim(), i)}</p>
      ))}
    </div>
  );
}

/** A single tappable term (keyword chip in a list, weapon ability, rule name). */
export function Term({ term, index, upper }: { term: string; index?: DataIndex; upper?: boolean }) {
  const popup = useRulePopup();
  return (
    <button className={`kw ${upper ? 'kw-upper' : ''}`} onClick={() => popup.openTerm(term, index)}>
      {term}
    </button>
  );
}
