/**
 * What an ability mainly does, from its text, so the app can colour it:
 * buffs your attacks, debuffs the enemy, protects your unit, moves/deploys,
 * or anything else (leader auras, CP, Fights First…).
 */
export type AbilityKind = 'attack' | 'debuff' | 'defence' | 'move' | 'utility';

export const ABILITY_KIND_LABEL: Record<AbilityKind, string> = {
  attack: 'Attack buff',
  debuff: 'Enemy debuff',
  defence: 'Defence',
  move: 'Movement',
  utility: 'Utility',
};

const DEBUFF = /\b(enemy (unit|model)s?|that (enemy )?unit|opponent)\b[^.]*\b(subtract|worsen|-\d|cannot|must take a battle-shock|battle-shocked|halve|reduce)/i;
const DEBUFF2 = /\b(select one|selected)\b[^.]*\benemy unit\b/i;
const DEFENCE = /\b(targets? this (unit|model)|attack (is allocated|targets) (to )?(a model in )?this|invulnerable save|feel no pain|cannot be (wounded|targeted)|lone operative|stealth|benefit of cover|mortal wounds? (is|are) lost|ignore[sd]? any or all modifiers)\b/i;
const ATTACK = /\b(makes? an attack|each time (a|this) model[^.]*attack|hit roll|wound roll|re-roll|lethal hits|sustained hits|devastating wounds|critical (hit|wound)|strength characteristic|attacks characteristic|armour penetration|damage characteristic|\[precision\]|\[lance\]|\[ignores cover\])/i;
const MOVE = /\b(advanc\w*|fall(s)? back|fell back|declare a charge|normal move|deep strike|scouts?|infiltrators?|strategic reserves|set (it )?up|charge roll|disembark|move characteristic|redeploy|reserves)\b/i;

export function abilityKind(name: string, text: string): AbilityKind {
  const t = `${name}. ${text}`;
  // "Damaged: 1-5 wounds remaining" is a penalty, not a buff.
  if (/^damaged\b/i.test(name)) return 'utility';
  if (DEFENCE.test(t) && /\b(this unit|this model|bearer)\b/i.test(t) && !ATTACK.test(text.split(/targets? this/i)[0] ?? '')) return 'defence';
  if (DEBUFF.test(t) || DEBUFF2.test(t)) return 'debuff';
  if (ATTACK.test(t)) return 'attack';
  if (DEFENCE.test(t)) return 'defence';
  if (MOVE.test(t)) return 'move';
  return 'utility';
}
