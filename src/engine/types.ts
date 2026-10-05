/**
 * The app's own model. User data only ever stores ids and counts that point
 * into the downloaded game data, so a saved or shared list carries no rules text.
 */

export type RuleKind =
  | 'core'
  | 'datasheet'
  | 'stratagem'
  | 'enhancement'
  | 'detachment'
  | 'army'
  | 'ability'
  | 'keyword'
  | 'weaponAbility';

export interface WeaponProfile {
  id: string;
  name: string;
  /** Short code shown as a column header in the unit grid, e.g. "HBP". */
  short: string;
  melee: boolean;
  range: string;
  /** Attacks as printed: "2", "D3", "D6+1". */
  attacks: string;
  skill: string;
  strength: string;
  ap: string;
  damage: string;
  keywords: string[];
}

/** One kind of model inside a unit and the weapons it carries. */
export interface ModelLoadout {
  /** Stable key for grouping identical models, e.g. the BSData model entry id. */
  key: string;
  name: string;
  /** Group label shown as a bracket in the grid, e.g. "Initiates". */
  group: string;
  weaponIds: string[];
}

/** A concrete model in a roster unit. Identical models share a loadout key. */
export interface ModelInstance {
  id: string;
  loadoutKey: string;
  alive: boolean;
}

export interface Selection {
  entryId: string;
  count: number;
  children: Selection[];
}

export interface RosterUnit {
  id: string;
  entryId: string;
  name: string;
  points: number;
  primaryCategory: string;
  models: ModelInstance[];
  leaderOf?: string; // id of the RosterUnit this character leads
  enhancementId?: string;
  isWarlord?: boolean;
  selections: Selection[];
}

export interface Roster {
  id: string;
  name: string;
  folder?: string;
  gameSystemId: string;
  catalogueId: string;
  factionName: string;
  /** Data version the list was built against (git commit of the data repo). */
  dataCommit?: string;
  battleSize: 'incursion' | 'strikeForce' | 'custom';
  pointsLimit: number;
  detachmentIds: string[];
  forceDisposition?: string;
  units: RosterUnit[];
  createdAt: number;
  updatedAt: number;
}

export interface Issue {
  severity: 'error' | 'advice';
  title: string;
  /** Plain-language reason: what rule is broken and by how much. */
  why: string;
  /** Suggested fix the UI can show as a button label. */
  fix?: string;
  unitId?: string;
}
