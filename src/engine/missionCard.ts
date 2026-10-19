/**
 * Mission-deck card text -> structure the battle screen can score with:
 * intro text, then sections per battle round ("FIRST AND SECOND BATTLE ROUND",
 * "SECOND BATTLE ROUND ONWARDS"…), each with its WHEN and scoring lines.
 */
export interface ScoreItem {
  text: string;
  vp: number;
  /** "For each …": a counter instead of a tick. */
  each: boolean;
  /** "(UP TO 5VP)" */
  cap?: number;
  /** Line starting with "+": adds to the line above. */
  bonus?: boolean;
  /** Line only applies when secondaries are used Fixed / Tactical. */
  mode?: 'fixed' | 'tactical';
  /** "OR …": an alternative to the line(s) above it; only one of them scores. */
  or?: boolean;
}

export interface CardSection {
  title: string;
  from: number;
  to: number;
  when?: string;
  lines: string[];
  items: ScoreItem[];
}

export interface ParsedCard {
  intro: string[];
  sections: CardSection[];
  /** Lines after the sections that aren't scoring (actions, notes). */
  notes: string[];
}

const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
const ROUND_HEAD = /^(?:(first|second|third|fourth|fifth|any)(?:\s*(?:,|and|or|to)\s*(first|second|third|fourth|fifth))*\s+battle rounds?(?:\s+onwards)?|end of the battle|end of battle)$/i;

export function roundsOf(title: string): { from: number; to: number } {
  const t = title.toLowerCase();
  if (/any battle round/.test(t)) return { from: 1, to: 5 };
  if (/end of (the )?battle/.test(t)) return { from: 5, to: 5 };
  const nums = Object.entries(ORD)
    .filter(([w]) => new RegExp(`\\b${w}\\b`).test(t))
    .map(([, n]) => n);
  if (!nums.length) return { from: 1, to: 5 };
  const from = Math.min(...nums);
  const to = /onwards/.test(t) ? 5 : Math.max(...nums);
  return { from, to };
}

const plain = (s: string) => s.replace(/\*\*/g, '').trim();

export function parseCard(text: string): ParsedCard {
  const out: ParsedCard = { intro: [], sections: [], notes: [] };
  let cur: CardSection | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Card-type labels that slipped into older imports ("Secondary MissionSecondary Missions: Attacker…").
    if (/^(?:(?:primary|secondary) missions?(?::\s*(?:attacker|defender|fixed|tactical))?\s*)+$/i.test(plain(line))) continue;
    if (ROUND_HEAD.test(plain(line))) {
      cur = { title: plain(line), ...roundsOf(plain(line)), lines: [], items: [] };
      out.sections.push(cur);
      continue;
    }
    if (!cur) {
      out.intro.push(line);
      continue;
    }
    const when = plain(line).match(/^WHEN:\s*(.*)$/i);
    if (when) {
      cur.when = when[1];
      continue;
    }
    const vp = line.match(/^(\+?)(.*?)\s*(?:—\s*)?\+?(\d+)\s*VP(.*)$/i);
    if (vp && /\d+\s*VP/i.test(line)) {
      // "OR Two or more…" (older imports glue it on: "ORTwo or more…").
      const orMatch = vp[2]!.match(/^OR(?:\s+|(?=[A-Z]))/);
      const body = vp[2]!.slice(orMatch?.[0].length ?? 0).replace(/^\+/, '').trim();
      const each = /^for (each|every)\b/i.test(plain(body));
      const bonusLine = vp[1] === '+' || /^\+/.test(line);
      // One or more values, each with its tags: "2VP", "3VPFIXED", "+1VPFIXEDCUMULATIVE",
      // "4VP · FIXED — 5VP · TACTICAL(UP TO 5VP)" (a different value per way of playing).
      const values: { vp: number; tags: string[]; cap?: number }[] = [];
      let rest = `${vp[3]}VP${vp[4]}`;
      for (let m; (m = rest.match(/^[\s—+]*(\d+)\s*VP/i)); ) {
        rest = rest.slice(m[0].length);
        const tags: string[] = [];
        for (let t; (t = rest.match(/^[\s·]*(FIXED|TACTICAL|CUMULATIVE)/i)); rest = rest.slice(t[0].length)) tags.push(t[1]!.toLowerCase());
        const cap = rest.match(/^\s*\(?\s*up to\s*(\d+)\s*VP\s*\)?/i);
        if (cap) rest = rest.slice(cap[0].length);
        values.push({ vp: Number(m[1]), tags, cap: cap ? Number(cap[1]) : undefined });
      }
      // A cap written once at the end of the line applies to every value when there's only one.
      const tailCap = rest.match(/up to\s*(\d+)\s*VP/i);
      for (const v of values) {
        const mode = v.tags.includes('fixed') ? 'fixed' : v.tags.includes('tactical') ? 'tactical' : undefined;
        const cap = v.cap ?? (tailCap && values.length === 1 ? Number(tailCap[1]) : undefined);
        cur.items.push({ text: body, vp: v.vp, each, cap, bonus: bonusLine || v.tags.includes('cumulative'), mode, or: orMatch ? true : undefined });
      }
      continue;
    }
    cur.lines.push(line);
  }
  return out;
}

/** Sections that apply in a battle round. */
export function sectionsFor(card: ParsedCard, round: number): CardSection[] {
  return card.sections.filter((s) => round >= s.from && round <= s.to);
}

/** VP for ticks/counters on a section's items (caps applied). */
export function scoreItems(items: ScoreItem[], counts: number[]): number {
  return items.reduce((sum, it, i) => {
    const n = counts[i] ?? 0;
    const v = it.each ? n * it.vp : n > 0 ? it.vp : 0;
    return sum + (it.cap ? Math.min(it.cap, v) : v);
  }, 0);
}
