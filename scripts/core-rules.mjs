#!/usr/bin/env node
/**
 * Build step: turn Wahapedia's Core Rules page into sections the app can show
 * inside its rule popups and Reference → Core rules. Output:
 *   <outDir>/core-rules.json  [{ num: "09.06", title: "Advance", text: "..." }, ...]
 * Never fails the build. "Powered by Wahapedia".
 *
 *   node scripts/core-rules.mjs [outDir] [url]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function htmlToLines(html) {
  let s = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|select|button)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|table|ul|ol|section|article|blockquote)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|tr|table|ul|ol|section|article|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => (t.trim() ? `**${t.trim()}**` : ''))
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
}

/** Section headings on the page look like "Advance 09.06" (title then a rule number). */
const HEAD = /^(?:\*\*)?([A-Za-z][^|•]{1,80}?)(?:\*\*)?\s+(\d{2}(?:\.\d{2}){0,2})(?:\*\*)?$/;
const MARK = /^@@SEC (\d{2}(?:\.\d{2}){0,2}) (.+)$/;

/** Remove every `<div class="cls">…</div>` block, nested divs included (Wahapedia's hidden tooltip copies). */
export function stripDivs(html, cls) {
  const open = new RegExp(`<div class="${cls}"[^>]*>`, 'g');
  const tag = /<(\/?)div\b[^>]*>/g;
  let out = '';
  let from = 0;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    out += html.slice(from, m.index);
    tag.lastIndex = m.index + m[0].length;
    let depth = 1;
    let t = null;
    while (depth > 0 && (t = tag.exec(html))) depth += t[1] ? -1 : 1;
    from = t ? tag.lastIndex : html.length;
    open.lastIndex = from;
  }
  return out + html.slice(from);
}

/** "FALL-BACK MOVE" -> "Fall-Back Move", "[LETHAL HITS]" -> "Lethal Hits", "2. Pile In" -> "Pile In". */
export function sectionTitle(raw) {
  const t = raw.replace(/\*\*/g, '').replace(/[[\]]/g, '').replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, a, b) => a + b.toUpperCase()) : t;
}

/** Each numbered heading (`<span class="h_number">09.07</span>`) becomes one marker line. Same logic as src/engine/coreRules.ts. */
function markHeadings(html) {
  return stripDivs(html, 'tooltip_templates')
    .replace(/([^<>]*)<span class="h_number">([\d.]+)<\/span>\s*\/\s*([^<>]*)<span class="h_number">[\d.]+<\/span>/g, (_m, a, n, b) => `\n<p>@@SEC ${n} ${a.trim()} / ${b.trim()}</p>\n`)
    .replace(/([^<>]*)<span class="h_number">([\d.]+)<\/span>/g, (_m, t, n) => `\n<p>@@SEC ${n} ${t.trim()}</p>\n`);
}

export function parseCoreRules(html) {
  const marked = html.includes('class="h_number"');
  const sections = [];
  let cur = null;
  for (const line of htmlToLines(marked ? markHeadings(html) : html)) {
    const m = marked ? line.match(MARK) : line.match(HEAD);
    if (m) {
      if (cur) sections.push(cur);
      cur = marked ? { num: m[1], title: sectionTitle(m[2]), lines: [] } : { num: m[2], title: m[1].replace(/\*\*/g, '').trim(), lines: [] };
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) sections.push(cur);
  // A section shown twice on the page (a short card, then the full rule) keeps its longest copy, in the first place.
  const out = new Map();
  for (const s of sections) {
    const text = s.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const prev = out.get(s.num);
    if (!prev) out.set(s.num, { num: s.num, title: s.title, text });
    else if (text.length > prev.text.length) prev.text = text;
  }
  return [...out.values()].filter((s) => s.text.length > 20 || s.num.split('.').length === 1);
}

async function main() {
  const out = process.argv[2] ?? 'wahapedia';
  const url = process.argv[3] ?? 'https://wahapedia.ru/wh40k11ed/the-rules/core-rules/';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'EmperorsList build (personal use)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const sections = parseCoreRules(await res.text());
    if (sections.length < 10) throw new Error(`only ${sections.length} sections found — page layout may have changed`);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'core-rules.json'), JSON.stringify({ source: url, fetchedAt: new Date().toISOString(), sections }));
    console.log(`Core rules: ${sections.length} sections → ${join(out, 'core-rules.json')}`);
  } catch (e) {
    console.warn(`Core rules not built: ${e.message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
