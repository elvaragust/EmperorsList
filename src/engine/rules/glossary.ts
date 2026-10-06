import type { DataIndex } from '../bsdata/index';
import type { RuleKind } from '../types';
import { ruleText } from './nodes';

export interface RuleDef {
  name: string;
  text: string;
  kind: RuleKind;
  source: string;
}

const norm = (s: string) =>
  s
    .replace(/\^\^|\*\*|[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** "Sustained Hits 1" -> "sustained hits", "Anti-Infantry 4+" -> "anti", "Scouts 6\"" -> "scouts". */
export function baseRuleName(term: string): string {
  let t = norm(term);
  if (/^anti-/.test(t)) return 'anti';
  t = t.replace(/\s+(d?\d+\+?|\d+"|\d+\+\*?|x)$/i, '').replace(/\*$/, '');
  return t.trim();
}

interface Glossary {
  rules: Map<string, RuleDef>;
  keywords: Map<string, RuleDef>;
}
const cache = new WeakMap<DataIndex, Glossary>();

function glossary(index: DataIndex): Glossary {
  const hit = cache.get(index);
  if (hit) return hit;
  const g: Glossary = { rules: new Map(), keywords: new Map() };
  const gst = index.gameSystem?.id;
  for (const r of index.rules.values()) {
    const text = ruleText(r);
    if (!text) continue;
    const origin = index.origin.get(r.id);
    const def: RuleDef = {
      name: r.name,
      text,
      kind: origin === gst ? 'core' : 'army',
      source: index.catalogues.get(origin ?? '')?.name ?? '',
    };
    const k = norm(r.name);
    if (!g.rules.has(k) || def.kind === 'core') g.rules.set(k, def);
  }
  for (const p of index.profiles.values()) {
    if (p.typeName !== 'Abilities') continue;
    const k = norm(p.name);
    if (g.rules.has(k)) continue;
    const text = p.characteristics?.map((c) => c.$text ?? '').join('\n') ?? '';
    if (text) g.rules.set(k, { name: p.name, text, kind: 'ability', source: index.catalogues.get(index.origin.get(p.id) ?? '')?.name ?? '' });
  }
  for (const c of index.categories.values()) {
    const text = c.rules?.map(ruleText).join('\n\n') ?? '';
    g.keywords.set(norm(c.name.replace(/^Faction: /, '')), { name: c.name.replace(/^Faction: /, ''), text, kind: 'keyword', source: 'Keyword' });
  }
  cache.set(index, g);
  return g;
}

/** Definition for a tapped word: a rule, weapon ability, ability or keyword. */
export function lookupRule(index: DataIndex, term: string): RuleDef | undefined {
  const g = glossary(index);
  const exact = norm(term);
  const base = baseRuleName(term);
  const rule = g.rules.get(exact) ?? g.rules.get(base);
  if (rule) return { ...rule, kind: rule.kind === 'core' && isWeaponAbility(base) ? 'weaponAbility' : rule.kind };
  const section = findCoreSection(term);
  const kw = g.keywords.get(exact) ?? g.keywords.get(base);
  if (kw && (kw.text || !section)) return kw;
  if (section) return { name: section.title, text: section.text, kind: 'core', source: `Core Rules ${section.num}` };
  if (kw) return kw;
  const core = CORE_TERMS.find((t) => t.toLowerCase() === exact);
  if (core) return { name: core, text: '', kind: 'core', source: 'Core rules' };
  return undefined;
}

export function allRules(index: DataIndex): RuleDef[] {
  return [...glossary(index).rules.values()];
}

const WEAPON_ABILITIES = new Set([
  'anti', 'assault', 'blast', 'conversion', 'devastating wounds', 'extra attacks', 'hazardous', 'heavy', 'ignores cover', 'indirect fire',
  'lance', 'lethal hits', 'melta', 'one shot', 'pistol', 'precision', 'psychic', 'rapid fire', 'sustained hits', 'torrent', 'twin-linked', 'cleave', 'close-quarters',
]);
export const isWeaponAbility = (base: string) => WEAPON_ABILITIES.has(base);

/**
 * Core-rule terms that show up in ability text but whose rules live in the
 * Core Book, not the community data. They are still made tappable; the popup
 * then points to the core rules.
 */
export const CORE_TERMS = [
  'Advance', 'Advanced', 'Fall Back', 'Fell Back', 'Normal move', 'Surge move', 'Remain Stationary', 'Remained Stationary',
  'Battle-shock', 'Battle-shocked', 'Battle-shock test', 'Engagement Range', 'Objective Control', 'objective marker',
  'Strategic Reserves', 'Reinforcements', 'Pile in', 'Consolidate', 'Fights First', 'mortal wound', 'mortal wounds',
  'invulnerable save', 'Critical Hit', 'Critical Wound', 'Benefit of Cover', 'Attached unit', 'Bodyguard', 'Embark', 'Disembark',
  'Desperate Escape', 'Fire Overwatch', 'Overwatch', 'Heroic Intervention', 'Command phase', 'Movement phase', 'Shooting phase',
  'Charge phase', 'Fight phase', 'Hit roll', 'Wound roll', 'saving throw', 'Damage characteristic', 'Leadership test', 'Out of Action',
];

export interface TermMatcher {
  re: RegExp | null;
  canonical: Map<string, string>;
}

const matcherCache = new WeakMap<DataIndex, { v: number; m: TermMatcher }>();

/** Core Rules sections loaded on this device (from the site build). Set by the data layer. */
let coreSections: { num: string; title: string; text: string }[] = [];
let coreVersion = 0;
const GENERIC = new Set(['books', 'introduction', 'basic rules', 'armies', 'dice', 'datasheets', 'terrain', 'objectives', 'stratagems', 'actions', 'aircraft', 'transports', 'moving', 'reference', 'muster armies', 'other concepts', 'core abilities', 'other rules and abilities']);
const stem = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\b(\w{3,})s\b/g, '$1').replace(/\s+/g, ' ').trim();

export function setCoreSections(list: { num: string; title: string; text: string }[]) {
  coreSections = list;
  coreVersion++;
}

/** The Core Rules section for a term ("surge move" -> "Surge Moves 21.02"). */
export function findCoreSection(term: string): { num: string; title: string; text: string } | undefined {
  if (!coreSections.length) return undefined;
  const t = stem(term);
  if (!t) return undefined;
  const withText = coreSections.filter((s) => s.text);
  return (
    withText.find((s) => stem(s.title) === t) ??
    withText.find((s) => stem(s.title).startsWith(t) || t.startsWith(stem(s.title))) ??
    withText.find((s) => s.num.includes('.') && stem(s.title).includes(t))
  );
}

/** One regex that finds every rule name or keyword the app can explain, longest first. */
export function termMatcher(index: DataIndex): TermMatcher {
  const hit = matcherCache.get(index);
  if (hit && hit.v === coreVersion) return hit.m;
  const g = glossary(index);
  const names = new Map<string, string>();
  const add = (n: string) => {
    const clean = n.replace(/\s+/g, ' ').trim();
    if (clean.length < 4 || /^\d/.test(clean)) return;
    if (!names.has(clean.toLowerCase())) names.set(clean.toLowerCase(), clean);
  };
  for (const r of g.rules.values()) if (r.kind === 'core' || r.kind === 'weaponAbility' || r.kind === 'army') add(r.name.replace(/\s+\d.*$/, ''));
  CORE_TERMS.forEach(add);
  coreSections.filter((c) => c.num.includes('.') && c.text && !GENERIC.has(c.title.toLowerCase())).forEach((c) => add(c.title));
  const list = [...names.values()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const m: TermMatcher = { re: list.length ? new RegExp(`\\b(${list.join('|')})\\b`, 'gi') : null, canonical: names };
  matcherCache.set(index, { v: coreVersion, m });
  return m;
}

export function isCoreTerm(term: string): boolean {
  return CORE_TERMS.some((t) => t.toLowerCase() === term.toLowerCase());
}

export const CORE_RULES_URL = 'https://wahapedia.ru/wh40k11ed/the-rules/core-rules/';
