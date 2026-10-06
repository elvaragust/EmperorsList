import { importWahapedia, type WahapediaFiles } from '@/engine/wahapedia';
import { db } from './db';

const KEY = 'emperorslist.relay';

export function relayUrl(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setRelayUrl(url: string) {
  try {
    if (url) localStorage.setItem(KEY, url.replace(/\/+$/, ''));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

const FILES: [keyof WahapediaFiles, string][] = [
  ['factions', 'Factions.csv'],
  ['stratagems', 'Stratagems.csv'],
  ['enhancements', 'Enhancements.csv'],
  ['detachmentAbilities', 'Detachment_abilities.csv'],
];

/** Download Wahapedia's export through the user's relay and replace the imported rules. */
export async function updateFromRelay(onProgress?: (msg: string) => void): Promise<{ total: number; stratagems: number }> {
  const base = relayUrl();
  if (!base) throw new Error('Set your relay URL first (see relay/README.md).');
  const parts: WahapediaFiles = {};
  for (const [key, file] of FILES) {
    onProgress?.(`Downloading ${file}…`);
    const res = await fetch(`${base}/wahapedia/${file}`);
    if (!res.ok) {
      if (key === 'stratagems' || key === 'factions') throw new Error(`${file}: the relay answered ${res.status}`);
      continue;
    }
    parts[key] = await res.text();
  }
  const rules = importWahapedia(parts);
  if (!rules.length) throw new Error('The files came back empty.');
  await db.transaction('rw', db.imported, async () => {
    await db.imported.clear();
    await db.imported.bulkPut(rules);
  });
  try {
    localStorage.setItem(`${KEY}.updated`, String(Date.now()));
  } catch {
    /* ignore */
  }
  return { total: rules.length, stratagems: rules.filter((r) => r.kind === 'stratagem').length };
}

export function lastRelayUpdate(): number | undefined {
  try {
    const v = localStorage.getItem(`${KEY}.updated`);
    return v ? Number(v) : undefined;
  } catch {
    return undefined;
  }
}
