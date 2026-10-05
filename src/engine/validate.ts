import type { Issue, Roster } from './types';

export interface BattleSizeRules {
  points: number;
  detachmentPoints: number;
  maxEnhancements: number;
  copiesPerDatasheet: number;
  /** Battleline datasheets may be taken this many times as often. */
  battlelineMultiplier: number;
}

/**
 * Limits from the 11th-edition army construction rules as published by GW.
 * They live here only until the loader reads them from the game data.
 */
export const BATTLE_SIZES: Record<'incursion' | 'strikeForce', BattleSizeRules> = {
  incursion: { points: 1000, detachmentPoints: 2, maxEnhancements: 2, copiesPerDatasheet: 2, battlelineMultiplier: 2 },
  strikeForce: { points: 2000, detachmentPoints: 3, maxEnhancements: 4, copiesPerDatasheet: 3, battlelineMultiplier: 2 },
};

/**
 * Army-level checks that every issue explains in words: what is wrong, why, and how to fix it.
 * Unit-level option constraints come from the BSData constraint engine (later phase).
 */
export function validateRoster(roster: Roster, detachmentCost: (id: string) => number): Issue[] {
  const issues: Issue[] = [];
  if (roster.battleSize === 'custom') return issues;
  const rules = BATTLE_SIZES[roster.battleSize];

  const total = roster.units.reduce((s, u) => s + u.points, 0);
  if (total > roster.pointsLimit) {
    issues.push({
      severity: 'error',
      title: `${total - roster.pointsLimit} pts over the limit`,
      why: `The battle size allows ${roster.pointsLimit.toLocaleString('en')} pts. This list is ${total.toLocaleString('en')}.`,
      fix: 'Show units by cost',
    });
  }

  const dp = roster.detachmentIds.reduce((s, id) => s + detachmentCost(id), 0);
  if (dp > rules.detachmentPoints) {
    issues.push({
      severity: 'error',
      title: `${dp} of ${rules.detachmentPoints} Detachment Points`,
      why: `Your detachments cost ${dp} Detachment Points; this battle size gives ${rules.detachmentPoints}.`,
      fix: 'Change detachments',
    });
  }

  const enh = roster.units.filter((u) => u.enhancementId).length;
  if (enh > rules.maxEnhancements) {
    issues.push({
      severity: 'error',
      title: `${enh} of ${rules.maxEnhancements} enhancements`,
      why: `This battle size allows ${rules.maxEnhancements} enhancements.`,
      fix: 'Remove an enhancement',
    });
  }

  const copies = new Map<string, { name: string; n: number; battleline: boolean }>();
  roster.units.forEach((u) => {
    const c = copies.get(u.entryId) ?? { name: u.name, n: 0, battleline: u.primaryCategory === 'Battleline' };
    c.n += 1;
    copies.set(u.entryId, c);
  });
  copies.forEach((c) => {
    const max = rules.copiesPerDatasheet * (c.battleline ? rules.battlelineMultiplier : 1);
    if (c.n > max) {
      issues.push({
        severity: 'error',
        title: `${c.name} × ${c.n}`,
        why: `This battle size allows ${max} copies of ${c.battleline ? 'a Battleline' : 'a non-Battleline'} datasheet. You have ${c.n}.`,
        fix: `Remove ${c.n - max}`,
      });
    }
  });

  if (!roster.units.some((u) => u.isWarlord)) {
    issues.push({ severity: 'error', title: 'No Warlord chosen', why: 'Every army needs a Warlord.', fix: 'Choose Warlord' });
  }
  return issues;
}
