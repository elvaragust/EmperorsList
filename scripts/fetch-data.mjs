#!/usr/bin/env node
/**
 * Download BSData catalogues into ../data-cache for the real-data tests.
 * Game data stays outside the repo. Usage:
 *   node scripts/fetch-data.mjs                       # Black Templars + what it links to
 *   node scripts/fetch-data.mjs "Necrons" "Orks"      # other factions by file name
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.env.EL_REPO ?? 'BSData/wh40k-11e';
const branch = process.env.EL_BRANCH ?? 'main';
const out = process.env.EL_DATA ?? join(dirname(fileURLToPath(import.meta.url)), '../../data-cache');
mkdirSync(out, { recursive: true });
const raw = (f) => `https://raw.githubusercontent.com/${repo}/${branch}/${encodeURIComponent(f)}`;

async function get(name) {
  const file = name.endsWith('.json') ? name : `${name}.json`;
  const dest = join(out, file);
  if (existsSync(dest)) return JSON.parse(readFileSync(dest, 'utf8'));
  const res = await fetch(raw(file));
  if (!res.ok) {
    console.warn(`skip ${file} (${res.status})`);
    return undefined;
  }
  const text = await res.text();
  writeFileSync(dest, text);
  console.log(`saved ${file}`);
  return JSON.parse(text);
}

const wanted = process.argv.slice(2);
if (!wanted.length) wanted.push('Imperium - Black Templars');
await get('Warhammer 40,000');
const seen = new Set();
const queue = [...wanted];
while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  const json = await get(name);
  for (const l of json?.catalogue?.catalogueLinks ?? []) queue.push(l.name);
}
console.log(`done → ${out}`);
