import type { RosterEngine } from './rosterEngine';
import { allyName, choiceRole, foreignKeyword } from './roles';

/** Warhammer Legends datasheets: the data marks them "Name [Legends]". */
export const isLegends = (name: string) => /\[legends\]/i.test(name);
export const legendsName = (name: string) => name.replace(/\s*\[legends\]\s*/i, ' ').trim();

/**
 * Turning on the data's "Show Legends" switch reveals every Legends datasheet the
 * army's catalogues can reach, not only the ones this army may field. Keep:
 *  - allied Legends only from allies the army can already take (not e.g. Unaligned Forces);
 *  - Epic Heroes only from the army's own catalogue, so a chapter army (Black
 *    Templars) doesn't get other chapters' named characters from Space Marines;
 *  - nothing carrying another chapter's faction keyword (Blood Ravens…).
 */
export function legendsFit(engine: RosterEngine, choice: { name: string; root: { node: { categoryIds: string[]; targetId: string } }; category?: string }, allowedAllies: Set<string>): boolean {
  if (!isLegends(choice.name)) return true;
  const node = choice.root.node;
  if (choiceRole(engine, node, choice.category) === 'Allied units') return allowedAllies.has(allyName(engine, node));
  if (foreignKeyword(engine, node)) return false;
  const cats = node.categoryIds.map((id) => engine.index.categories.get(id)?.name ?? '');
  if (cats.includes('Epic Hero')) {
    const origin = engine.index.catalogues.get(engine.index.origin.get(node.targetId) ?? '');
    if (origin && !origin.library && origin.id !== engine.roster.catalogueId) return false;
  }
  return true;
}
