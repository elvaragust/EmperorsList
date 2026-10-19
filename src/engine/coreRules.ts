/**
 * Core Rules page (HTML, e.g. Wahapedia's Core Rules saved from a browser)
 * -> sections. Same logic as scripts/core-rules.mjs, which the site build uses.
 */
import type { CoreSection } from './wahapedia';

export function htmlToLines(html: string): string[] {
  let s = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|select|button)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|table|ul|ol|section|article|blockquote)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|tr|table|ul|ol|section|article|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, t: string) => (t.trim() ? `**${t.trim()}**` : ''))
    .replace(/<td\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;|&#8217;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
}

const HEAD = /^(?:\*\*)?([A-Za-z][^|•]{1,80}?)(?:\*\*)?\s+(\d{2}(?:\.\d{2}){0,2})(?:\*\*)?$/;
const MARK = /^@@SEC (\d{2}(?:\.\d{2}){0,2}) (.+)$/;

/** Remove every `<div class="cls">…</div>` block, nested divs included (Wahapedia's hidden tooltip copies). */
export function stripDivs(html: string, cls: string): string {
  const open = new RegExp(`<div class="${cls}"[^>]*>`, 'g');
  const tag = /<(\/?)div\b[^>]*>/g;
  let out = '';
  let from = 0;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    out += html.slice(from, m.index);
    tag.lastIndex = m.index + m[0].length;
    let depth = 1;
    let t: RegExpExecArray | null = null;
    while (depth > 0 && (t = tag.exec(html))) depth += t[1] ? -1 : 1;
    from = t ? tag.lastIndex : html.length;
    open.lastIndex = from;
  }
  return out + html.slice(from);
}

/** "FALL-BACK MOVE" -> "Fall-Back Move", "[LETHAL HITS]" -> "Lethal Hits", "2. Pile In" -> "Pile In". */
export function sectionTitle(raw: string): string {
  const t = raw.replace(/\*\*/g, '').replace(/[[\]]/g, '').replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()) : t;
}

/**
 * Wahapedia marks each numbered heading with `<span class="h_number">09.07</span>`
 * (core sections, moves, abilities alike): turn each into one marker line.
 */
function markHeadings(html: string): string {
  return stripDivs(html, 'tooltip_templates')
    .replace(/([^<>]*)<span class="h_number">([\d.]+)<\/span>\s*\/\s*([^<>]*)<span class="h_number">[\d.]+<\/span>/g, (_m, a: string, n: string, b: string) => `\n<p>@@SEC ${n} ${a.trim()} / ${b.trim()}</p>\n`)
    .replace(/([^<>]*)<span class="h_number">([\d.]+)<\/span>/g, (_m, t: string, n: string) => `\n<p>@@SEC ${n} ${t.trim()}</p>\n`);
}

export function parseCoreRules(html: string): CoreSection[] {
  const marked = html.includes('class="h_number"');
  const sections: { num: string; title: string; lines: string[] }[] = [];
  let cur: { num: string; title: string; lines: string[] } | null = null;
  for (const line of htmlToLines(marked ? markHeadings(html) : html)) {
    const m = marked ? line.match(MARK) : line.match(HEAD);
    if (m) {
      if (cur) sections.push(cur);
      cur = marked ? { num: m[1]!, title: sectionTitle(m[2]!), lines: [] } : { num: m[2]!, title: m[1]!.replace(/\*\*/g, '').trim(), lines: [] };
      continue;
    }
    cur?.lines.push(line);
  }
  if (cur) sections.push(cur);
  // A section shown twice on the page (a short card, then the full rule) keeps its longest copy, in the first place.
  const out = new Map<string, CoreSection>();
  for (const s of sections) {
    const text = s.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const prev = out.get(s.num);
    if (!prev) out.set(s.num, { num: s.num, title: s.title, text });
    else if (text.length > prev.text.length) prev.text = text;
  }
  return [...out.values()].filter((s) => s.text.length > 20 || s.num.split('.').length === 1);
}
