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
  return g.keywords.get(exact) ?? g.keywords.get(base);
}

export function allRules(index: DataIndex): RuleDef[] {
  return [...glossary(index).rules.values()];
}

const WEAPON_ABILITIES = new Set([
  'anti', 'assault', 'blast', 'conversion', 'devastating wounds', 'extra attacks', 'hazardous', 'heavy', 'ignores cover', 'indirect fire',
  'lance', 'lethal hits', 'melta', 'one shot', 'pistol', 'precision', 'psychic', 'rapid fire', 'sustained hits', 'torrent', 'twin-linked', 'cleave', 'close-quarters',
]);
export const isWeaponAbility = (base: string) => WEAPON_ABILITIES.has(base);
