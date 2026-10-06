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

export const DISPOSITIONS = Object.keys(MISSION_DECK.primaries);

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
  /** The once-per-battle "spend 1CP: discard one and draw a new one" has been used. */
  newOrdersUsed?: boolean;
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

export function discardTactical(t: TacticalState, name: string): TacticalState {
  return { ...t, active: t.active.filter((a) => a !== name), discarded: [...t.discarded, name] };
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
