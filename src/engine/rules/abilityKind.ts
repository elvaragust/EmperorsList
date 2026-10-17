/**
 * What an ability mainly does, from its text. Shown as a small hint icon on
 * each ability (not a colour), so the list stays calm but scannable.
 */
export type AbilityKind = 'offence' | 'debuff' | 'defence' | 'movement' | 'deployment' | 'support' | 'objective' | 'resource' | 'other';

export const ABILITY_KIND_LABEL: Record<AbilityKind, string> = {
  offence: 'Boosts its attacks',
  debuff: 'Hinders the enemy',
  defence: 'Protects the unit',
  movement: 'Moving and charging',
  deployment: 'Deployment and reserves',
  support: 'Helps other units',
  objective: 'Objectives and actions',
  resource: 'Command points and stratagems',
  other: 'Other',
};

const DEPLOY = /\b(deep strike|scouts?|infiltrators?|strategic reserves|reserves|set (it |this unit |them )?up|redeploy|deployment)\b/i;
const RESOURCE = /\b(command points?|\d+\s*cp\b|cp\b|stratagems?)\b/i;
const OBJECTIVE = /\b(objective markers?|objective control|\boc\b|actions?\b|sticky|control of)\b/i;
const DEFENCE = /\b(attacks? [^.]{0,20}targets? this (unit|model)|attack is allocated to|invulnerable save|feel no pain|cannot be (wounded|targeted)|lone operative|stealth|benefit of cover|mortal wounds? (is|are) lost|damage characteristic of that attack|subtract 1 from the (hit|wound) roll)\b/i;
const DEBUFF = /\b(enemy (unit|model)s?|that (enemy )?unit|opponent)\b[^.]*\b(subtract|worsen|-\d|cannot|must take a battle-shock|battle-shock|halve|reduce)/i;
const DEBUFF2 = /\bselect one\b[^.]*\benemy unit\b/i;
const OFFENCE = /\b(makes? an attack|each time (a|this) model[^.]*attack|hit roll|wound roll|re-roll|lethal hits|sustained hits|devastating wounds|critical (hit|wound)|strength characteristic|attacks characteristic|armour penetration|\[precision\]|\[lance\]|\[ignores cover\]|fights first)/i;
const SUPPORT = /\b(friendly [^.]*(units?|models?)[^.]*within|aura|while this model is leading|the unit this model is leading)\b/i;
const MOVEMENT = /\b(advanc\w*|fall(s)? back|fell back|declare a charge|charge roll|normal move|move characteristic|disembark|embark|pile[- ]in|consolidat\w*|surge move)\b/i;

export function abilityKind(name: string, text: string): AbilityKind {
  const t = `${name}. ${text}`;
  if (/^damaged\b/i.test(name)) return 'other';
  if (/^(leader|support)$/i.test(name)) return 'support';
  if (/^(transport|firing deck)/i.test(name)) return 'movement';
  const enemyPart = DEBUFF.test(t) || DEBUFF2.test(t);
  if (DEPLOY.test(t) && !OFFENCE.test(text) && !enemyPart) return 'deployment';
  if (DEFENCE.test(t) && /\b(this unit|this model|bearer|models? in (this|that) unit)\b/i.test(t) && !enemyPart) return 'defence';
  if (enemyPart) return 'debuff';
  if (SUPPORT.test(t) && !/\bwhile this model is leading\b[^.]*\b(makes? an attack|hit roll|wound roll)/i.test(t)) return 'support';
  if (OFFENCE.test(t)) return 'offence';
  if (RESOURCE.test(t)) return 'resource';
  if (OBJECTIVE.test(t)) return 'objective';
  if (DEFENCE.test(t)) return 'defence';
  if (MOVEMENT.test(t)) return 'movement';
  return 'other';
}
