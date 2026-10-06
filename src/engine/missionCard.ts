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
const ROUND_HEAD = /^(?:(first|second|third|fourth|fifth|any)(?:\s*(?:,|and|or)\s*(first|second|third|fourth|fifth))*\s+battle rounds?(?:\s+onwards)?|end of the battle|end of battle)$/i;

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
    const vp = line.match(/^(\+?)(.*?)\s*(?:—\s*)?\+?(\d+)\s*VP\b(.*)$/i);
    if (vp && /\d+\s*VP/i.test(line)) {
      const body = vp[2]!.replace(/^\+/, '').trim();
      const cap = vp[4]!.match(/up to\s*(\d+)\s*VP/i);
      cur.items.push({ text: body, vp: Number(vp[3]), each: /^for (each|every)\b/i.test(plain(body)), cap: cap ? Number(cap[1]) : undefined, bonus: vp[1] === '+' || /^\+/.test(line) });
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
