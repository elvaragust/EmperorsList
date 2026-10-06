import type { DataIndex } from '@/engine/bsdata/index';
import { configChoices } from '@/engine/rules/config';
import { baseRuleName, isWeaponAbility } from '@/engine/rules/glossary';
import { ruleText } from '@/engine/rules/nodes';
import { ENH, RosterEngine, rootOptions } from '@/engine/rules/rosterEngine';
import type { Roster } from '@/engine/types';
import type { ImportedRule } from '@/engine/wahapedia';
import type { SearchDoc } from './searchIndex';

export interface RefDoc extends SearchDoc {
  /** Where tapping the hit goes: a datasheet route, or a popup with this text. */
  route?: string;
  catalogueId?: string;
  extra?: string;
}

export function blankRoster(catalogueId: string): Roster {
  return {
    id: 'ref',
    name: '',
    gameSystemId: '',
    catalogueId,
    factionName: '',
    battleSize: 'strikeForce',
    pointsLimit: 2000,
    config: [],
    detachmentIds: [],
    units: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

const shortCat = (name: string) => name.replace(/^(Imperium|Chaos|Xenos|Aeldari) - (Adeptus Astartes - )?/, '');

/** Every searchable thing in the downloaded data plus imported stratagems. */
export function buildDocs(index: DataIndex, imported: ImportedRule[]): RefDoc[] {
  const docs: RefDoc[] = [];
  const seen = new Set<string>();
  const add = (d: RefDoc) => {
    const key = `${d.kind}|${d.name.toLowerCase()}|${d.text.slice(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);
    docs.push(d);
  };
  const gst = index.gameSystem?.id;
  const catName = (id?: string) => shortCat(index.catalogues.get(id ?? '')?.name ?? '');

  for (const r of index.rules.values()) {
    const text = ruleText(r);
    if (!text || r.hidden) continue;
    const origin = index.origin.get(r.id);
    const core = origin === gst;
    add({ id: `rule:${r.id}`, kind: core ? (isWeaponAbility(baseRuleName(r.name)) ? 'weaponAbility' : 'core') : 'army', name: r.name, text, source: core ? 'Core rules' : catName(origin) });
  }

  for (const cat of index.catalogues.values()) {
    if (cat.library || cat.id === gst) continue;
    const roots = rootOptions(index, cat.id);
    const engine = new RosterEngine(index, blankRoster(cat.id), roots);
    const fname = shortCat(cat.name);
    // Detachments and their rules
    for (const d of configChoices(engine).detachments) {
      if (d.hidden) continue;
      for (const r of d.rules) add({ id: `det:${d.key}:${r.name}`, kind: 'detachment', name: r.name === d.name ? d.name : `${d.name}: ${r.name}`, text: r.text, source: `${fname} · ${d.dp} DP`, catalogueId: cat.id });
    }
    // Units
    for (const u of engine.unitChoices()) {
      const abilities = u.root.node.profiles.filter((p) => p.typeName === 'Abilities').map((p) => p.name);
      add({ id: `unit:${cat.id}:${u.root.key}`, kind: 'datasheet', name: u.name, text: abilities.join(', '), source: `${fname} · ${u.points} pts`, route: `/reference/unit/${cat.id}/${u.root.key}`, catalogueId: cat.id });
    }
  }

  // Enhancements: entries that cost an Enhancement
  for (const e of index.entries.values()) {
    if (!e.type || e.hidden) continue;
    if (!e.costs?.some((c) => c.typeId === ENH && c.value > 0)) continue;
    const text = e.profiles?.map((p) => p.characteristics?.map((c) => c.$text ?? '').join('\n')).join('\n') ?? '';
    const pts = e.costs.find((c) => c.typeId === '51b2-306e-1021-d207')?.value;
    add({ id: `enh:${e.id}`, kind: 'enhancement', name: e.name, text, source: `${catName(index.origin.get(e.id))}${pts ? ` · ${pts} pts` : ''}` });
  }

  // Unit abilities
  for (const p of index.profiles.values()) {
    if (p.typeName !== 'Abilities' || p.hidden) continue;
    const text = p.characteristics?.map((c) => c.$text ?? '').join('\n') ?? '';
    if (!text) continue;
    add({ id: `ab:${p.id}`, kind: 'ability', name: p.name, text, source: catName(index.origin.get(p.id)) });
  }

  // Keywords
  for (const c of index.categories.values()) {
    if (/^(Allies:|Configuration|Reference|Crusade)/.test(c.name)) continue;
    add({ id: `kw:${c.id}`, kind: 'keyword', name: c.name.replace(/^Faction: /, ''), text: c.rules?.map(ruleText).join('\n') ?? '', source: c.name.startsWith('Faction: ') ? 'Faction keyword' : 'Keyword' });
  }

  for (const r of imported) {
    if (r.kind === 'coreRule') {
      add({ id: r.id, kind: 'core', name: r.name, text: r.text, source: `Core Rules ${r.detachment ?? ''} · Wahapedia` });
      continue;
    }
    const kind = r.kind === 'stratagem' ? 'stratagem' : r.kind === 'enhancement' ? 'enhancement' : 'detachment';
    const bits = [r.cp ? `${r.cp}CP` : '', r.detachment ?? r.faction, r.phase ?? ''].filter(Boolean);
    add({ id: r.id, kind, name: r.name, text: r.text, source: `${bits.join(' · ')} · Wahapedia`, extra: [r.type, r.turn, r.phase].filter(Boolean).join(' · ') });
  }
  return docs;
}
