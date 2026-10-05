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
  field: string; // "selections" | a costTypeId | ...
  scope: string; // "self" | "parent" | "force" | "roster" | ...
  childId?: string;
  includeChildSelections?: boolean;
  message?: string;
}

export interface RawCondition {
  type: string; // "atLeast" | "lessThan" | "equalTo" | "instanceOf" ...
  value: number;
  field: string;
  scope: string;
  childId?: string;
}

export interface RawModifier {
  type: string; // "set" | "increment" | "decrement" | "append" | ...
  field: string;
  value: number | string | boolean;
  conditions?: RawCondition[];
  conditionGroups?: { type: 'and' | 'or'; conditions?: RawCondition[] }[];
  affects?: string; // New Recruit extension
}

export interface RawLink {
  id: string;
  name: string;
  targetId: string;
  type: string; // "selectionEntry" | "selectionEntryGroup" | "profile" | "rule" | "infoGroup" | "catalogue"
  hidden?: boolean;
  primary?: boolean;
  constraints?: RawConstraint[];
  modifiers?: RawModifier[];
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
  modifierGroups?: { type?: string; modifiers?: RawModifier[] }[]; // New Recruit extension
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
  categoryEntries?: { id: string; name: string }[];
  entryLinks?: RawLink[];
  sharedSelectionEntries?: RawEntry[];
  sharedSelectionEntryGroups?: RawEntry[];
  sharedProfiles?: RawProfile[];
  sharedRules?: RawRule[];
  costTypes?: { id: string; name: string }[];
}

export interface RawFile {
  catalogue?: RawCatalogue;
  gameSystem?: RawCatalogue;
}
