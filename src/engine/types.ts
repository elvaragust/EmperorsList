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

/**
 * One chosen option. `entryId` is the BSData id of the option as offered by its
 * parent (the entryLink id when the option is a link, else the entry id).
 * `count` is per one of the parent: 5 Initiates each with 1 Bolt Rifle is
 * { Initiate, count 5, children: [{ Bolt Rifle, count 1 }] }.
 * The same option can appear more than once with different children
 * (e.g. one Initiate split off to carry a different weapon).
 */
export interface Selection {
  entryId: string;
  count: number;
  children: Selection[];
}

export interface RosterUnit {
  id: string;
  /** Root option id in the catalogue (entryLink id or entry id). */
  entryId: string;
  /** Cached for list screens; recomputed whenever the unit changes. */
  name: string;
  points: number;
  primaryCategory: string;
  /** Id of the RosterUnit this character is attached to (Leader or Support). */
  leaderOf?: string;
  /** Children of the unit's own selection: models, wargear, enhancement, Warlord. */
  selections: Selection[];
  /** Optional nickname shown instead of the datasheet name. */
  nickname?: string;
}

export type BattleSize = 'incursion' | 'strikeForce' | 'onslaught' | 'custom';

export interface Roster {
  id: string;
  name: string;
  folder?: string;
  gameSystemId: string;
  catalogueId: string;
  factionName: string;
  /** Data version the list was built against (git commit of the data repo). */
  dataCommit?: string;
  battleSize: BattleSize;
  pointsLimit: number;
  /**
   * Army-level selections exactly as the data models them: Battle Size,
   * Detachment(s), Force Disposition, "Show Legends" and so on. The rules
   * engine reads these, so conditions like "if Incursion" just work.
   */
  config: Selection[];
  /** Cached display copies of what `config` holds. */
  detachmentIds: string[];
  detachmentNames?: string[];
  forceDisposition?: string;
  units: RosterUnit[];
  /** Casualties tracked from the roster screen: unit id -> dead model ids. */
  tracking?: Record<string, string[]>;
  notes?: string;
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
