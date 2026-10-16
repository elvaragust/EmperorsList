import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '@/data/db';
import { detachmentRules } from '@/engine/rules/armyRules';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import { sameName } from '@/engine/wahapedia';

export interface DetRule {
  detachment: string;
  name: string;
  text: string;
  wp: boolean;
}

/** The list's detachment rules, with Wahapedia's text when it has it, else the game data's. */
export function useDetachmentRules(engine?: RosterEngine): DetRule[] {
  const imported = useLiveQuery(() => db.imported.where('kind').equals('detachmentRule').toArray(), []);
  return useMemo(() => {
    if (!engine) return [];
    const dets = engine.roster.detachmentNames ?? [];
    const fromData = detachmentRules(engine);
    return dets.flatMap((d): DetRule[] => {
      const wp = (imported ?? []).filter((r) => sameName(r.detachment ?? '', d));
      return wp.length ? wp.map((r) => ({ detachment: d, name: r.name, text: r.text, wp: true })) : fromData.filter((r) => r.detachment === d).map((r) => ({ ...r, wp: false }));
    });
  }, [engine, imported]);
}

/** Words in rules text that are never unit keywords. */
const NOT_KEYWORDS = new Set(['WHEN', 'TARGET', 'EFFECT', 'RESTRICTIONS', 'RESTRICTION', 'CP', 'VP', 'OC', 'WS', 'BS', 'AP', 'D6', 'D3', 'AND', 'OR']);

/** Keywords a rule's text calls out: ^^Marked^^ ones and Wahapedia's UPPER CASE ones. */
export function ruleKeywords(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\^\^\**([^^]+?)\**\^\^/g)) out.add(m[1]!.replace(/\*/g, '').trim().toUpperCase());
  for (const m of text.matchAll(/\b[A-Z][A-Z'’-]{2,}(?:\s+[A-Z][A-Z'’-]{1,})*\b/g)) {
    const k = m[0].trim();
    if (!NOT_KEYWORDS.has(k)) out.add(k);
  }
  return [...out];
}

/**
 * The detachment rules that concern a unit: a rule naming unit keywords
 * (SWORD BRETHREN, VEHICLE…) applies to units that have one of them; a rule
 * naming only the army's faction keywords, or none, applies to every unit.
 */
export function rulesForUnit(rules: DetRule[], unitKeywords: string[], factionKeywords: string[], allKeywords: Set<string>): DetRule[] {
  const mine = new Set(unitKeywords.map((k) => k.toUpperCase()));
  const factions = new Set(factionKeywords.map((k) => k.toUpperCase()));
  return rules.filter((r) => {
    const named = ruleKeywords(r.text).filter((k) => allKeywords.has(k) && !factions.has(k));
    return !named.length || named.some((k) => mine.has(k));
  });
}

/** Every keyword the game data knows (upper case, without "Faction: "). */
export function knownKeywords(engine: RosterEngine): Set<string> {
  return new Set([...engine.index.categories.values()].map((c) => c.name.replace(/^Faction:\s*/i, '').toUpperCase()));
}

/** Detachment rules for a unit and the characters leading it (by their datasheets' keywords). */
export function useUnitDetachmentRules(engine: RosterEngine | undefined, sheets: { keywords: string[]; factionKeywords: string[] }[]): DetRule[] {
  const rules = useDetachmentRules(engine);
  const known = useMemo(() => (engine ? knownKeywords(engine) : new Set<string>()), [engine]);
  const kw = sheets.flatMap((s) => s.keywords);
  const fk = sheets.flatMap((s) => s.factionKeywords);
  const key = `${kw.join('|')}#${fk.join('|')}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => rulesForUnit(rules, kw, fk, known), [rules, known, key]);
}
