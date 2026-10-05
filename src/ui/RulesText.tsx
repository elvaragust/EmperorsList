import { Fragment, type ReactNode } from 'react';
import type { DataIndex } from '@/engine/bsdata/index';
import { lookupRule } from '@/engine/rules/glossary';
import { useRulePopup } from './RulePopup';

/**
 * Renders BSData rules markup: ^^**KEYWORD**^^, **bold**, [WEAPON ABILITY].
 * Anything that has a definition in the data becomes tappable.
 */
export function RulesText({ text, index, inline }: { text: string; index?: DataIndex; inline?: boolean }) {
  const popup = useRulePopup();
  const paragraphs = text.replace(/\r/g, '').split(/\n{2,}/);
  const render = (para: string, pi: number) => {
    const out: ReactNode[] = [];
    const re = /\^\^\*\*(.+?)\*\*\^\^|\^\^(.+?)\^\^|\*\*(.+?)\*\*|\[([A-Z][A-Z0-9 +\-"']+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(para))) {
      if (m.index > last) out.push(para.slice(last, m.index));
      const kw = m[1] ?? m[2];
      const bold = m[3];
      const ability = m[4];
      const term = (kw ?? bold ?? ability ?? '').trim();
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
        out.push(<strong key={`${pi}-${k++}`}>{bold}</strong>);
      } else {
        out.push(
          <span key={`${pi}-${k++}`} className={cls}>
            {label}
          </span>,
        );
      }
      last = m.index + m[0].length;
    }
    if (last < para.length) out.push(para.slice(last));
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
