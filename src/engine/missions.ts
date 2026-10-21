/**
 * Card names from the 11th edition Chapter Approved Mission Deck 2026-27, as
 * listed on Wahapedia. Names only — the card rules are linked, not copied.
 * Update when a new deck is released.
 */
export const MISSION_DECK = {
  name: 'Mission Deck 2026-27',
  url: 'https://wahapedia.ru/wh40k11ed/the-rules/mission-deck-2026-27',
  primaries: {
    'Take and Hold': ['Battlefield Dominance', 'Immovable Object', 'Determined Acquisition', 'Purge and Secure', 'Inescapable Dominion'],
    'Purge the Foe': ['Unstoppable Force', 'Meatgrinder', 'Punishment', 'Consecrate', "Destroyer's Wrath"],
    Disruption: ['Death Trap', 'Delaying Action', 'Outmanoeuvre', 'Smoke and Mirrors', 'Locate and Deny'],
    Reconnaissance: ['Reconnaissance Sweep', 'Triangulation', 'Surveil the Foe', 'Gather Intel', 'Search and Scour'],
    'Priority Assets': ['Secure Asset', 'Vital Link', 'Extract Relic', 'Vanguard Operation', 'Sabotage'],
  } as Record<string, string[]>,
  deployments: ['Tipping Point', 'Sweeping Engagement', 'Search and Destroy', 'Hammer and Anvil', 'Dawn of War', 'Crucible of Battle'],
  secondaries: [
    'No Prisoners', 'Overwhelming Force', 'Plunder', 'Display of Might', 'Outflank', 'Beacon', 'Cleanse', 'A Grievous Blow', 'Defend Stronghold',
    'Engage on All Fronts', "Secure No Man's Land", 'Forward Position', 'Centre Ground', 'Assassination', 'A Tempting Target', 'Behind Enemy Lines',
    'Bring It Down', 'Burden of Trust',
  ],
  /** Cards marked Fixed: the only ones you may pick when playing Fixed secondaries. */
  fixed: ['A Grievous Blow', 'Bring It Down', 'Engage on All Fronts', 'Assassination'],
  twists: ['Nowhere to Hide', 'Mirrored World', 'Scrambled Communications', 'Martial Pride', 'Ruinscape', 'Night Fighting'],
};

/**
 * Force Dispositions. Each one's primary missions above are listed in this
 * same order of the OPPONENT's disposition: on the Purge the Foe card, the
 * mission under the Take and Hold symbol is the first one (Unstoppable Force).
 */
export const DISPOSITIONS = Object.keys(MISSION_DECK.primaries);

/** Your primary mission: the one on your Force Disposition card under your opponent's symbol. */
export function primaryFor(mine?: string, theirs?: string): string | undefined {
  if (!mine || !theirs) return undefined;
  const i = DISPOSITIONS.indexOf(theirs);
  return i >= 0 ? MISSION_DECK.primaries[mine]?.[i] : undefined;
}

/** For each disposition you may pick: the primary it gives you against theirs. */
export function primaryOptions(allowed: string[], theirs?: string): { disposition: string; primary?: string }[] {
  const list = allowed.length ? DISPOSITIONS.filter((d) => allowed.includes(d)) : DISPOSITIONS;
  return list.map((d) => ({ disposition: d, primary: primaryFor(d, theirs) }));
}

/** Secondary cards you may pick as Fixed: the deck's Fixed-marked cards (from card text when loaded). */
export function fixedSecondaries(tags?: Map<string, string[]>): string[] {
  const fromText = tags ? MISSION_DECK.secondaries.filter((s) => tags.get(s)?.includes('fixed')) : [];
  return fromText.length ? fromText : MISSION_DECK.fixed;
}

/** Secondary cards a player can use: cards tagged only for the other role are left out. */
export function secondariesFor(role?: 'attacker' | 'defender', tags?: Map<string, string[]>): string[] {
  if (!role || !tags) return MISSION_DECK.secondaries;
  return MISSION_DECK.secondaries.filter((s) => {
    const t = tags.get(s) ?? [];
    const roles = t.filter((x) => x === 'attacker' || x === 'defender');
    return !roles.length || roles.includes(role);
  });
}

/** Shuffle (Fisher–Yates). */
export function shuffled<T>(list: T[], rnd = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Tactical secondaries: the deck, the cards in hand, and what has been scored or discarded. */
export interface TacticalState {
  deck: string[];
  active: string[];
  scored: { name: string; round: number }[];
  discarded: string[];
  /** Discarded cards that gave 1CP (taken back if the discard is undone). */
  discardCp?: string[];
  /** Older saves: the once-per-battle redraw was used. Redraws are now unlimited and counted in `redraws`. */
  newOrdersUsed?: boolean;
  /** How many times "spend 1CP: discard one and draw a new one" was used. */
  redraws?: number;
  /** Battle round + turn of the last draw, so it is offered once per Command phase. */
  drawnFor?: string;
}

export function newTactical(cards: string[]): TacticalState {
  return { deck: shuffled(cards), active: [], scored: [], discarded: [] };
}

/** Draw `n` cards face up (the deck is reshuffled from discards if it runs out). */
export function drawTactical(t: TacticalState, n = 2): TacticalState {
  let deck = [...t.deck];
  let discarded = [...t.discarded];
  const active = [...t.active];
  for (let i = 0; i < n; i++) {
    if (!deck.length && discarded.length) {
      deck = shuffled(discarded);
      discarded = [];
    }
    const c = deck.shift();
    if (c) active.push(c);
  }
  return { ...t, deck, discarded, active };
}

export function scoreTactical(t: TacticalState, name: string, round: number): TacticalState {
  return { ...t, active: t.active.filter((a) => a !== name), scored: [...t.scored, { name, round }] };
}

export function discardTactical(t: TacticalState, name: string, forCp = false): TacticalState {
  return { ...t, active: t.active.filter((a) => a !== name), discarded: [...t.discarded, name], discardCp: forCp ? [...(t.discardCp ?? []), name] : t.discardCp };
}

/** Undo a discard or a score: the card goes back into the hand. */
export function restoreTactical(t: TacticalState, name: string): TacticalState {
  const i = t.discarded.lastIndexOf(name);
  const discarded = i >= 0 ? t.discarded.filter((_, k) => k !== i) : t.discarded;
  const j = t.scored.map((s) => s.name).lastIndexOf(name);
  const scored = i < 0 && j >= 0 ? t.scored.filter((_, k) => k !== j) : t.scored;
  const cp = t.discardCp ?? [];
  const c = i >= 0 ? cp.lastIndexOf(name) : -1;
  return { ...t, discarded, scored, discardCp: c >= 0 ? cp.filter((_, k) => k !== c) : cp, active: [...t.active, name] };
}

/**
 * A part of the primary scored in a battle round: the lines scored at one
 * moment ("command", "turn", "battle", or "anyTurn@2-me" for a card that
 * scores at the end of either player's turn). `counts` are the ticks per card
 * section (by position), so they stay shown; `vp` is what was added.
 */
export interface PrimaryPart {
  round: number;
  part: string;
  vp: number;
  counts?: Record<number, number[]>;
}

/**
 * Everything about one side's missions during a battle: how they play
 * secondaries (two Fixed cards, or a Tactical deck and hand) and which parts
 * of the primary have been scored in which rounds. In a live game each team has one, kept
 * in the shared state, so teammates manage it together and opponents can read it.
 */
export interface SecondaryState {
  mode?: 'fixed' | 'tactical';
  fixed: string[];
  tactical?: TacticalState;
  /** Older saves: battle rounds whose whole primary card was locked after one Add (until enabled again). */
  primaryDone?: number[];
  /** Parts of the primary scored, per round (each locked until undone). */
  primaryParts?: PrimaryPart[];
}

export type SecOp =
  /** Tactical needs a shuffled deck: the phone that picks it shuffles, so every copy gets the same order. */
  | { op: 'mode'; mode: 'fixed' | 'tactical'; deck?: string[] }
  | { op: 'fixed'; cards: string[] }
  /** Draw up to two at the start of a Command phase; `key` (round-turn) makes it once per turn. */
  | { op: 'draw'; n: number; key: string }
  | { op: 'score'; name: string; round: number }
  | { op: 'discard'; name: string }
  | { op: 'restore'; name: string }
  /** Spend 1CP: discard a card and draw a new one. As many times as you like. */
  | { op: 'redraw'; name: string }
  /** Draw one card for free, any time (a card's own rule, a missed draw, a house rule). */
  | { op: 'drawFree' }
  /** Put a chosen card into the hand, from the deck or the discards (picked from the list of all secondaries). */
  | { op: 'take'; name: string }
  /**
   * Put a card back into the deck and draw a new one, free ("WHEN DRAWN: if it
   * is the first battle round, draw a new card and shuffle this one back").
   * `at` is where it goes in the deck (picked by the phone, so every copy agrees); never on top.
   */
  | { op: 'shuffleBack'; name: string; at: number }
  /**
   * The primary was scored (`done`) or opened again. With `part`, only that
   * part of the round (see PrimaryPart); without, the whole round (older saves).
   */
  | { op: 'primaryDone'; round: number; done: boolean; part?: string; vp?: number; counts?: Record<number, number[]> };

export const emptySecondaries = (): SecondaryState => ({ fixed: [] });

export function applySecOp(s: SecondaryState, o: SecOp): SecondaryState {
  const t = s.tactical;
  switch (o.op) {
    case 'mode':
      if (o.mode === s.mode) return s;
      return {
        ...s,
        mode: o.mode,
        fixed: o.mode === 'fixed' ? s.fixed : [],
        tactical: o.mode === 'tactical' ? (o.deck ? { deck: [...o.deck], active: [], scored: [], discarded: [] } : newTactical(MISSION_DECK.secondaries)) : undefined,
      };
    case 'fixed':
      return { ...s, fixed: o.cards.slice(0, 2) };
    case 'draw':
      if (!t || t.drawnFor === o.key) return s;
      return { ...s, tactical: { ...drawTactical(t, o.n), drawnFor: o.key } };
    case 'score':
      return t && t.active.includes(o.name) ? { ...s, tactical: scoreTactical(t, o.name, o.round) } : s;
    case 'discard':
      return t && t.active.includes(o.name) ? { ...s, tactical: discardTactical(t, o.name) } : s;
    case 'restore':
      return t ? { ...s, tactical: restoreTactical(t, o.name) } : s;
    case 'redraw':
      if (!t || !t.active.includes(o.name)) return s;
      return { ...s, tactical: { ...drawTactical(discardTactical(t, o.name), 1), redraws: (t.redraws ?? 0) + 1 } };
    case 'take': {
      if (!t || t.active.includes(o.name)) return s;
      const i = t.discarded.lastIndexOf(o.name);
      return {
        ...s,
        tactical: {
          ...t,
          deck: t.deck.filter((d) => d !== o.name),
          discarded: i >= 0 ? t.discarded.filter((_, k) => k !== i) : t.discarded,
          scored: t.scored.filter((x) => x.name !== o.name),
          active: [...t.active, o.name],
        },
      };
    }
    case 'drawFree':
      return t ? { ...s, tactical: drawTactical(t, 1) } : s;
    case 'shuffleBack': {
      if (!t || !t.active.includes(o.name)) return s;
      // Draw first, so the card that goes back can't come straight back.
      const drawn = drawTactical({ ...t, active: t.active.filter((a) => a !== o.name) }, 1);
      const at = Math.max(0, Math.min(o.at, drawn.deck.length));
      return { ...s, tactical: { ...drawn, deck: [...drawn.deck.slice(0, at), o.name, ...drawn.deck.slice(at)] } };
    }
    case 'primaryDone': {
      if (o.part !== undefined) {
        const parts = s.primaryParts ?? [];
        const has = parts.some((p) => p.round === o.round && p.part === o.part);
        // Scoring a part twice (a double tap, two phones) keeps the first.
        if (o.done === has) return s;
        return {
          ...s,
          primaryParts: o.done ? [...parts, { round: o.round, part: o.part, vp: o.vp ?? 0, counts: o.counts }] : parts.filter((p) => !(p.round === o.round && p.part === o.part)),
        };
      }
      const set = new Set(s.primaryDone ?? []);
      if (o.done) set.add(o.round);
      else set.delete(o.round);
      return { ...s, primaryDone: [...set].sort((a, b) => a - b) };
    }
    default:
      return s;
  }
}

/** Primary missions, with the ones for your Force Disposition first. */
export function primariesFor(disposition?: string): { disposition: string; missions: string[] }[] {
  const entries = Object.entries(MISSION_DECK.primaries).map(([d, missions]) => ({ disposition: d, missions }));
  return disposition ? [...entries.filter((e) => e.disposition === disposition), ...entries.filter((e) => e.disposition !== disposition)] : entries;
}

/** Only your Force Disposition's primary missions: the one under your opponent's symbol on your card is yours. */
export function ownPrimaries(disposition?: string): string[] {
  return (disposition && MISSION_DECK.primaries[disposition]) || [];
}

/** Toggle a name in a comma-separated list. */
export function toggleInList(list: string, name: string): string {
  const items = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const has = items.includes(name);
  return (has ? items.filter((i) => i !== name) : [...items, name]).join(', ');
}
