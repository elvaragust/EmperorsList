/**
 * Shapes of the BSData files as they arrive (JSON in wh40k-11e; older repos are
 * XML and are normalised into the same shape by `normalizeXml`).
 *
 * Only the fields the engine reads are typed. Everything else is kept as-is,
 * so new upstream fields never break loading.
 */

export interface RawCost {
  name: string;
  typeId: string;
  value: number;
}

export interface RawCharacteristic {
  name: string;
  typeId: string;
  $text?: string;
}

export interface RawProfile {
  id: string;
  name: string;
  typeId: string;
  typeName: string; // "Unit" | "Ranged Weapons" | "Melee Weapons" | "Abilities" | ...
  hidden?: boolean;
  characteristics?: RawCharacteristic[];
  modifiers?: RawModifier[];
}

export interface RawRule {
  id: string;
  name: string;
  hidden?: boolean;
  description?: string | { $text?: string };
}

export interface RawConstraint {
  id: string;
  type: 'min' | 'max';
  value: number;
  field: string; // "selections" | "forces" | "associations" | a costTypeId
  scope: string; // "self" | "parent" | "force" | "roster" | "root-entry" | an entry id ...
  childId?: string;
  includeChildSelections?: boolean;
  includeChildForces?: boolean;
  percentValue?: boolean;
  message?: string;
}

export interface RawCondition {
  type: string; // "atLeast" | "lessThan" | "equalTo" | "instanceOf" | "before" ...
  value: number;
  field: string;
  scope: string;
  childId?: string;
  includeChildSelections?: boolean;
  includeChildForces?: boolean;
}

/** New Recruit extension: count instances in scope that satisfy every inner condition. */
export interface RawLocalConditionGroup extends RawCondition {
  repeats?: number;
  conditions?: RawCondition[];
  conditionGroups?: RawConditionGroup[];
}

export interface RawConditionGroup {
  type: 'and' | 'or';
  conditions?: RawCondition[];
  conditionGroups?: RawConditionGroup[];
  localConditionGroups?: RawLocalConditionGroup[];
}

export interface RawRepeat {
  childId?: string;
  field: string;
  scope: string;
  value: number;
  repeats: number;
  roundUp?: boolean;
  includeChildSelections?: boolean;
  includeChildForces?: boolean;
}

export interface RawModifier {
  type: string; // "set" | "increment" | "decrement" | "append" | "add" | "remove" ...
  field: string;
  value: number | string | boolean;
  conditions?: RawCondition[];
  conditionGroups?: RawConditionGroup[];
  repeats?: RawRepeat[];
  affects?: string; // New Recruit extension (not applied yet)
  scope?: string;
  join?: string;
}

export interface RawModifierGroup {
  type?: string;
  conditions?: RawCondition[];
  conditionGroups?: RawConditionGroup[];
  repeats?: RawRepeat[];
  modifiers?: RawModifier[];
  modifierGroups?: RawModifierGroup[];
}

export interface RawAssociation {
  id: string;
  name: string;
  label?: string;
  childId?: string;
  min?: number;
  max?: number;
  scope?: string;
  conditions?: RawCondition[];
  conditionGroups?: RawConditionGroup[];
}

/** A link can carry its own children, constraints and modifiers that add to its target's. */
export interface RawLink {
  id: string;
  name: string;
  targetId: string;
  type: string; // "selectionEntry" | "selectionEntryGroup" | "profile" | "rule" | "infoGroup" | "catalogue"
  hidden?: boolean;
  primary?: boolean;
  importRootEntries?: boolean;
  constraints?: RawConstraint[];
  modifiers?: RawModifier[];
  modifierGroups?: RawModifierGroup[];
  costs?: RawCost[];
  categoryLinks?: RawLink[];
  entryLinks?: RawLink[];
  selectionEntries?: RawEntry[];
  selectionEntryGroups?: RawEntry[];
  profiles?: RawProfile[];
  rules?: RawRule[];
  infoLinks?: RawLink[];
}

export interface RawEntry {
  id: string;
  name: string;
  type?: 'unit' | 'model' | 'upgrade' | string; // absent on groups
  hidden?: boolean;
  collective?: boolean;
  defaultSelectionEntryId?: string;
  costs?: RawCost[];
  profiles?: RawProfile[];
  rules?: RawRule[];
  infoLinks?: RawLink[];
  categoryLinks?: RawLink[];
  constraints?: RawConstraint[];
  modifiers?: RawModifier[];
  modifierGroups?: RawModifierGroup[]; // New Recruit extension
  associations?: RawAssociation[]; // New Recruit extension (Leader/Support attachment)
  page?: number | string;
  selectionEntries?: RawEntry[];
  selectionEntryGroups?: RawEntry[];
  entryLinks?: RawLink[];
}

export interface RawCatalogue {
  id: string;
  name: string;
  revision: number;
  library?: boolean;
  gameSystemId?: string;
  catalogueLinks?: RawLink[];
  categoryEntries?: RawEntry[];
  selectionEntries?: RawEntry[];
  entryLinks?: RawLink[];
  sharedSelectionEntries?: RawEntry[];
  sharedSelectionEntryGroups?: RawEntry[];
  sharedProfiles?: RawProfile[];
  sharedRules?: RawRule[];
  costTypes?: { id: string; name: string }[];
  forceEntries?: RawForceEntry[];
  sharedInfoGroups?: RawEntry[];
  /** Catalogue-level rule links: the faction's army rules. */
  infoLinks?: RawLink[];
}

export interface RawForceEntry {
  id: string;
  name: string;
  hidden?: boolean;
  constraints?: RawConstraint[];
  modifiers?: RawModifier[];
  categoryLinks?: RawLink[];
  forceEntries?: RawForceEntry[];
}

export interface RawFile {
  catalogue?: RawCatalogue;
  gameSystem?: RawCatalogue;
}
