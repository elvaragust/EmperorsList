import type { RawProfile, RawRule } from '../bsdata/raw';

export interface Protection {
  kind: 'Invulnerable save' | 'Feel No Pain';
  value: string;
  /** "against ranged attacks", "against mortal wounds"… */
  against?: string;
  /** Character it comes from when it only protects that model. */
  only?: string;
}

const textOf = (p: RawProfile) => p.characteristics?.map((c) => c.$text ?? '').join(' ') ?? '';
const againstIn = (s: string) => s.match(/\bagainst ([^.;,()]+)/i)?.[1]?.trim();

/**
 * Invulnerable saves and Feel No Pain from a unit's datasheet (and the
 * characters leading it): "Invulnerable save 4+ · against ranged attacks".
 * A character's own save only covers that model unless the text says it's
 * given to the unit it leads.
 */
export function protections(sheets: { name: string; own: boolean; abilities: RawProfile[]; rules: RawRule[] }[]): Protection[] {
  const out: Protection[] = [];
  const add = (p: Protection) => {
    if (!out.some((x) => x.kind === p.kind && x.value === p.value && x.against === p.against && x.only === p.only)) out.push(p);
  };
  for (const s of sheets) {
    for (const a of s.abilities) {
      const text = textOf(a);
      const whole = `${a.name} ${text}`;
      const forUnit = /\b(models? in (this|that) unit|the unit this model is leading|while this model is leading|bodyguard)\b/i.test(text);
      const only = s.own || forUnit ? undefined : s.name;
      const inv = text.match(/(\d)\+\s*invulnerable save([^.]*)/i) ?? (/invulnerable save/i.test(a.name) ? text.match(/^\s*(\d)\+\s*(.*)$/) : null);
      if (inv) add({ kind: 'Invulnerable save', value: `${inv[1]}+`, against: againstIn(inv[2] ?? '') ?? againstIn(a.name), only });
      const fnp = whole.match(/feel no pain(?: ability)?\s*(\d)\+([^.]*)/i) ?? (/feel no pain/i.test(a.name) ? text.match(/^\s*(\d)\+\s*(.*)$/) : null);
      if (fnp) add({ kind: 'Feel No Pain', value: `${fnp[1]}+`, against: againstIn(fnp[2] ?? ''), only });
    }
    for (const r of s.rules) {
      const m = r.name.match(/^feel no pain\s*(\d)\+/i);
      if (m) add({ kind: 'Feel No Pain', value: `${m[1]}+`, only: s.own ? undefined : s.name });
    }
  }
  return out;
}
