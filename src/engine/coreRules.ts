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

export function parseCoreRules(html: string): CoreSection[] {
  const sections: { num: string; title: string; lines: string[] }[] = [];
  let cur: { num: string; title: string; lines: string[] } | null = null;
  for (const line of htmlToLines(html)) {
    const m = line.match(HEAD);
    if (m) {
      if (cur) sections.push(cur);
      cur = { num: m[2]!, title: m[1]!.replace(/\*\*/g, '').trim(), lines: [] };
      continue;
    }
    cur?.lines.push(line);
  }
  if (cur) sections.push(cur);
  return sections
    .map((s) => ({ num: s.num, title: s.title, text: s.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() }))
    .filter((s) => s.text.length > 20 || s.num.split('.').length === 1);
}
