/**
 * Wahapedia export files (pipe-separated CSV) -> rules the app can show.
 * Used only for what BSData doesn't carry, mainly Stratagems. The files are
 * downloaded by the user (or by scripts/wahapedia.mjs) and imported on their
 * device; nothing from Wahapedia ships with the app. Credited as
 * "Powered by Wahapedia" wherever shown.
 */

export type ImportedKind = 'stratagem' | 'enhancement' | 'detachmentRule' | 'coreRule' | 'mission';

export interface ImportedRule {
  id: string;
  kind: ImportedKind;
  faction: string;
  factionId: string;
  name: string;
  detachment?: string;
  cp?: string;
  type?: string;
  /** "Your turn", "Opponent's turn", "Either player's turn" */
  turn?: string;
  /** "Command phase", "Shooting phase", "Any phase" ... */
  phase?: string;
  legend?: string;
  text: string;
  source: 'Wahapedia';
}

/** Parse one Wahapedia CSV: "|" separated, header row first, rows may end with a trailing "|". */
export function parsePipeCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = clean.split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) => {
    const parts = l.split('|');
    if (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts;
  };
  const header = split(lines[0]!).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  let pending = '';
  for (const raw of lines.slice(1)) {
    // Descriptions may contain newlines: join until the column count is reached.
    pending = pending ? `${pending}\n${raw}` : raw;
    const parts = split(pending);
    if (parts.length < header.length) continue;
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (parts[i] ?? '').trim()));
    rows.push(row);
    pending = '';
  }
  return rows;
}

/** Wahapedia HTML -> plain text with **bold** kept, the same markup BSData uses. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gis, '**$2**')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface WahapediaFiles {
  factions?: string;
  stratagems?: string;
  enhancements?: string;
  detachmentAbilities?: string;
}

/** Guess which export a file is from its header row. */
export function detectFile(name: string, text: string): keyof WahapediaFiles | undefined {
  const head = text.slice(0, 400).toLowerCase();
  if (/stratagem/i.test(name) || (head.includes('cp_cost') && head.includes('phase'))) return 'stratagems';
  if (/enhancement/i.test(name)) return 'enhancements';
  if (/detachment_abilit/i.test(name)) return 'detachmentAbilities';
  if (/faction/i.test(name) || /^id\|name\|link/.test(head)) return 'factions';
  return undefined;
}

export function importWahapedia(files: WahapediaFiles): ImportedRule[] {
  const factions = new Map<string, string>();
  if (files.factions) parsePipeCsv(files.factions).forEach((r) => r.id && factions.set(r.id, r.name ?? r.id));
  const factionName = (id: string) => factions.get(id) ?? (id ? id : 'Core');
  const out: ImportedRule[] = [];

  if (files.stratagems) {
    for (const r of parsePipeCsv(files.stratagems)) {
      if (!r.name) continue;
      out.push({
        id: `wp-s-${r.id || `${r.faction_id}-${r.name}`}`,
        kind: 'stratagem',
        faction: factionName(r.faction_id ?? ''),
        factionId: r.faction_id ?? '',
        name: titleCase(r.name),
        detachment: r.detachment || undefined,
        cp: (r.cp_cost ?? '').match(/\d+/)?.[0] ?? '0',
        type: r.type || undefined,
        turn: r.turn || undefined,
        phase: r.phase || undefined,
        legend: r.legend ? htmlToText(r.legend) : undefined,
        text: htmlToText(r.description ?? ''),
        source: 'Wahapedia',
      });
    }
  }
  if (files.enhancements) {
    for (const r of parsePipeCsv(files.enhancements)) {
      if (!r.name) continue;
      out.push({
        id: `wp-e-${r.id || `${r.faction_id}-${r.name}`}`,
        kind: 'enhancement',
        faction: factionName(r.faction_id ?? ''),
        factionId: r.faction_id ?? '',
        name: r.name,
        detachment: r.detachment || undefined,
        cp: r.cost || undefined,
        legend: r.legend ? htmlToText(r.legend) : undefined,
        text: htmlToText(r.description ?? ''),
        source: 'Wahapedia',
      });
    }
  }
  if (files.detachmentAbilities) {
    for (const r of parsePipeCsv(files.detachmentAbilities)) {
      if (!r.name) continue;
      out.push({
        id: `wp-d-${r.id || `${r.faction_id}-${r.name}`}`,
        kind: 'detachmentRule',
        faction: factionName(r.faction_id ?? ''),
        factionId: r.faction_id ?? '',
        name: r.name,
        detachment: r.detachment || undefined,
        legend: r.legend ? htmlToText(r.legend) : undefined,
        text: htmlToText(r.description ?? ''),
        source: 'Wahapedia',
      });
    }
  }
  return out;
}

function titleCase(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\w)/g, (_, a, b: string) => a + b.toUpperCase()) : s;
}

const PHASES = ['command', 'movement', 'shooting', 'charge', 'fight'] as const;

/** Does a stratagem apply in this phase and turn? Unknown phases are shown everywhere. */
export function stratagemFits(r: ImportedRule, phase: (typeof PHASES)[number], turn: 'me' | 'them'): boolean {
  const p = (r.phase ?? '').toLowerCase();
  const t = (r.turn ?? '').toLowerCase();
  const phaseOk = !p || p.includes('any') || p.includes(phase);
  const turnOk = !t || t.includes('either') || (turn === 'me' ? t.includes('your') : t.includes('opponent'));
  return phaseOk && turnOk;
}

/** Stratagems for an army: its detachments' ones plus core ones. Matching is by name. */
export function stratagemsFor(all: ImportedRule[], detachmentNames: string[], factionHints: string[]): ImportedRule[] {
  const dets = detachmentNames.map((d) => d.toLowerCase());
  const hints = factionHints.map((h) => h.toLowerCase());
  return all.filter((r) => {
    if (r.kind !== 'stratagem') return false;
    const det = (r.detachment ?? '').toLowerCase();
    if (det && dets.includes(det)) return true;
    const core = !det && (/core/i.test(r.type ?? '') || r.factionId === '' || /core/i.test(r.faction));
    if (core) return true;
    return !det && hints.some((h) => r.faction.toLowerCase().includes(h) || h.includes(r.faction.toLowerCase()));
  });
}

export interface CoreSection {
  num: string;
  title: string;
  text: string;
}

/** Core Rules sections (built from Wahapedia's Core Rules page) stored like other imported rules. */
export function coreSectionsToRules(sections: CoreSection[]): ImportedRule[] {
  return sections
    .filter((s) => s.text)
    .map((s) => ({ id: `wp-core-${s.num}`, kind: 'coreRule' as const, faction: 'Core', factionId: '', name: s.title, detachment: s.num, text: s.text, source: 'Wahapedia' as const }));
}

export interface MissionCard {
  name: string;
  /** primary | secondary | twist | deployment */
  kind: string;
  text: string;
  /** e.g. fixed, attacker, defender */
  tags?: string[];
}

/** Mission-deck cards (built from Wahapedia's mission deck page) stored like other imported rules. */
export function missionCardsToRules(cards: MissionCard[]): ImportedRule[] {
  return cards
    .filter((c) => c.name && c.text)
    .map((c) => ({ id: `wp-m-${c.kind}-${c.name}`, kind: 'mission' as const, faction: 'Mission deck', factionId: '', name: c.name, type: c.kind, legend: c.tags?.join(',') || undefined, text: c.text, source: 'Wahapedia' as const }));
}
