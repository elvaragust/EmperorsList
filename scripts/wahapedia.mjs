#!/usr/bin/env node
/**
 * Download Wahapedia's public export CSVs (Stratagems, Factions, Enhancements,
 * Detachment abilities) into ./wahapedia/ so you can import them in
 * Settings → Extra rules. Wahapedia blocks in-browser fetching, hence this script.
 * Respect Wahapedia's terms; the files are for your own device.
 *
 *   node scripts/wahapedia.mjs [baseUrl]
 * baseUrl defaults to https://wahapedia.ru/wh40k10ed/ — change it when an 11th edition export exists.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'https://wahapedia.ru/wh40k10ed/';
const files = ['Factions.csv', 'Stratagems.csv', 'Enhancements.csv', 'Detachment_abilities.csv'];
mkdirSync('wahapedia', { recursive: true });
for (const f of files) {
  const res = await fetch(base + f);
  if (!res.ok) {
    console.warn(`${f}: ${res.status}`);
    continue;
  }
  writeFileSync(`wahapedia/${f}`, Buffer.from(await res.arrayBuffer()));
  console.log(`saved wahapedia/${f}`);
}
console.log('Now open the app → Settings → Extra rules → Import CSV files, and pick these files.');
