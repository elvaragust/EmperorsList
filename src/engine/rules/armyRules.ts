import type { DataIndex } from '../bsdata/index';
import { catalogueChain } from '../bsdata/index';
import type { RawRule } from '../bsdata/raw';
import { ruleText } from './nodes';
import type { RosterEngine } from './rosterEngine';
import { configChoices } from './config';

/**
 * An army's own rules (Oath of Moment, Templar Vows…): rules the catalogue
 * links at its top level, or that most of its datasheets link to. Core rules
 * (Deep Strike, Leader…) are left out.
 */
export function armyRules(engine: RosterEngine): RawRule[] {
  const index: DataIndex = engine.index;
  const gst = index.gameSystem?.id;
  // The army's own catalogue and the factions it builds on (Space Marines for Black Templars) —
  // not the libraries it links for allies (a Thousand Sons list can take Chaos Knights, whose
  // rules mustn't become Thousand Sons army rules).
  const chain = catalogueChain(index, engine.roster.catalogueId);
  const base = (n: string) => n.replace(/\s*-?\s*library$/i, '').trim().toLowerCase();
  const self = base(chain[0]?.name ?? '');
  // Libraries count only when they are this army's own ("Chaos - Chaos Knights Library" for Chaos Knights).
  const own = new Set(chain.filter((c, i) => i === 0 || !c.library || base(c.name) === self).map((c) => c.id));
  // Units are counted from the army's catalogue and its own library only, so a big parent or
  // allied faction (Chaos Space Marines next to Chaos Knights) doesn't drown the army's own rule.
  const core = new Set(chain.filter((c, i) => i === 0 || base(c.name) === self).map((c) => c.id));
  const counts = new Map<string, number>();
  const units = engine.unitChoices().filter((u) => core.has(index.origin.get(u.root.node.targetId) ?? '') || core.has(index.origin.get(u.root.node.key) ?? ''));
  for (const u of units) {
    const target = index.entries.get(u.root.node.targetId);
    const links = [...u.root.node.infoLinks, ...(target?.infoLinks ?? [])];
    for (const id of new Set(links.filter((l) => l.type === 'rule').map((l) => l.targetId))) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const top = new Set(chain.filter((c) => own.has(c.id)).flatMap((c) => (c.infoLinks ?? []).filter((l) => l.type === 'rule').map((l) => l.targetId)));
  const out: RawRule[] = [];
  for (const [id, r] of index.rules) {
    if (!ruleText(r) || index.origin.get(id) === gst) continue;
    if (!own.has(index.origin.get(id) ?? '') && !top.has(id)) continue;
    const n = counts.get(id) ?? 0;
    if (top.has(id) || (units.length && n >= Math.max(3, units.length * 0.3))) out.push(r);
  }
  return out.sort((a, b) => Number(top.has(b.id)) - Number(top.has(a.id)) || a.name.localeCompare(b.name));
}

/** Rules of the detachments chosen for this list. */
export function detachmentRules(engine: RosterEngine): { detachment: string; name: string; text: string }[] {
  const chosen = new Set(engine.roster.detachmentIds);
  return configChoices(engine)
    .detachments.filter((d) => chosen.has(d.key))
    .flatMap((d) => d.rules.filter((r) => r.text).map((r) => ({ detachment: d.name, name: r.name, text: r.text })));
}
