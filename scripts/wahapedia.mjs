#!/usr/bin/env node
/**
 * Download Wahapedia's public export CSVs (Stratagems, Factions, Enhancements,
 * Detachment abilities, Last_update). The GitHub Pages build runs this and
 * publishes the files next to the app, so the app imports them by itself.
 * "Powered by Wahapedia".
 *
 *   node scripts/wahapedia.mjs [outDir] [baseUrl]
 *   outDir defaults to ./wahapedia, baseUrl to the 11th edition export.
 * Never fails the build: if Wahapedia can't be reached the app simply has no stratagems.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'wahapedia';
const base = process.argv[3] ?? 'https://wahapedia.ru/wh40k11ed/';
const files = ['Factions.csv', 'Stratagems.csv', 'Enhancements.csv', 'Detachment_abilities.csv', 'Abilities.csv', 'Last_update.csv'];
mkdirSync(out, { recursive: true });
let ok = 0;
for (const f of files) {
  try {
    const res = await fetch(base + f, { headers: { 'User-Agent': 'EmperorsList build (personal use)' } });
    if (!res.ok) {
      console.warn(`${f}: HTTP ${res.status}`);
      continue;
    }
    writeFileSync(join(out, f), Buffer.from(await res.arrayBuffer()));
    console.log(`saved ${join(out, f)}`);
    ok++;
  } catch (e) {
    console.warn(`${f}: ${e.message}`);
  }
}
// Make sure there is always a stamp the app can compare against.
if (ok && !existsSync(join(out, 'Last_update.csv'))) writeFileSync(join(out, 'Last_update.csv'), `last_update|\n${new Date().toISOString()}|\n`);
console.log(ok ? `Wahapedia: ${ok} files` : 'Wahapedia: nothing downloaded (the app will work without stratagems)');
