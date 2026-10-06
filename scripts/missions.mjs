#!/usr/bin/env node
/**
 * Build step: the rules text of each mission-deck card (primary missions,
 * secondary missions, twists, deployments), taken from Wahapedia's mission
 * deck page so the app can show what a card does when you pick it. Output:
 *   <outDir>/missions.json  { cards: [{ name, kind, text }] }
 * Never fails the build. "Powered by Wahapedia".
 *
 *   node scripts/missions.mjs [outDir] [url]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { htmlToLines } from './core-rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Card names come from src/engine/missions.ts so there is one list to update. */
export function deckNames(src = readFileSync(join(here, '../src/engine/missions.ts'), 'utf8')) {
  const block = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*([\\[{][\\s\\S]*?[\\]}])\\s*(?:as [^,]+)?,\\n`));
    return m ? [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"([^"]*)"/g)].map((x) => (x[1] ?? x[2]).replace(/\\'/g, "'")) : [];
  };
  const pm = src.match(/primaries:\s*\{([\s\S]*?)\}\s*as Record/);
  const prim = pm ? [...pm[1].matchAll(/\[([^\]]*)\]/g)].flatMap((b) => [...b[1].matchAll(/'((?:[^'\\]|\\.)*)'|"([^"]*)"/g)].map((x) => (x[1] ?? x[2]).replace(/\\'/g, "'"))) : [];
  return {
    primary: prim,
    secondary: block('secondaries'),
    twist: block('twists'),
    deployment: block('deployments'),
  };
}

const norm = (s) =>
  s
    .replace(/\*\*/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Split the page text into cards: a card starts at a line that is exactly a
 * known card name (headings on the page) and runs until the next card name
 * or section heading. The first occurrence with real text wins.
 */
export function parseMissionDeck(html, names = deckNames()) {
  const marked = html.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, __, t) => `\n@@H ${t.replace(/<[^>]+>/g, ' ')}\n`);
  const lines = htmlToLines(marked);
  const kindOf = new Map();
  for (const [kind, list] of Object.entries(names)) for (const n of list) kindOf.set(norm(n), { kind, name: n });
  const isHead = (l) => l.startsWith('@@H ');
  const PREFIX = /^(primary mission|secondary mission|twist|deployment|mission|force disposition)\s*:\s*/i;
  const clean = (l) => (isHead(l) ? l.slice(4) : l).replace(PREFIX, '');
  // Card-type labels printed on the card ("Secondary MissionSecondary Missions: Attacker…", "Opponent").
  const LABEL = /^(primary mission|secondary missions?|twist|deployment|opponent|player)\b/i;
  const cards = new Map();
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const text = cur.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const prev = cards.get(cur.name);
    if (text.length > 30 && (!prev || prev.text.length < text.length)) {
      const card = { name: cur.name, kind: cur.kind, text };
      if (cur.tags.size) card.tags = [...cur.tags];
      cards.set(cur.name, card);
    }
    cur = null;
  };
  for (const raw of lines) {
    const line = clean(raw).trim();
    const hit = kindOf.get(norm(line));
    if (hit) {
      flush();
      cur = { ...hit, lines: [], tags: new Set() };
      continue;
    }
    // Any other heading ends a card except the small headings inside one (battle rounds, actions…).
    if (isHead(raw) && cur && !/battle round|when|action|starts|units|completes|effect|use limit|fixed|tactical|mission|^\W*$/i.test(line)) {
      flush();
      continue;
    }
    if (!cur) continue;
    if (LABEL.test(line) && line.length < 120) {
      if (/attacker/i.test(line)) cur.tags.add('attacker');
      if (/defender/i.test(line)) cur.tags.add('defender');
      if (/\bfixed\b/i.test(line)) cur.tags.add('fixed');
      continue;
    }
    cur.lines.push(line.replace(/([^\s+])(\+?\d+VP)/g, '$1 — $2').replace(/VP(CUMULATIVE)/g, 'VP · $1'));
  }
  flush();
  return [...cards.values()];
}

async function main() {
  const out = process.argv[2] ?? 'wahapedia';
  const url = process.argv[3] ?? 'https://wahapedia.ru/wh40k11ed/the-rules/mission-deck-2026-27/';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'EmperorsList build (personal use)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cards = parseMissionDeck(await res.text());
    if (cards.length < 10) throw new Error(`only ${cards.length} cards found — page layout may have changed`);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'missions.json'), JSON.stringify({ source: url, fetchedAt: new Date().toISOString(), cards }));
    console.log(`Mission deck: ${cards.length} cards → ${join(out, 'missions.json')}`);
  } catch (e) {
    console.warn(`Mission deck not built: ${e.message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
