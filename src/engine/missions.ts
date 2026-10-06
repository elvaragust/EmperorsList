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
  twists: ['Nowhere to Hide', 'Mirrored World', 'Scrambled Communications', 'Martial Pride', 'Ruinscape', 'Night Fighting'],
};

/** Primary missions, with the ones for your Force Disposition first. */
export function primariesFor(disposition?: string): { disposition: string; missions: string[] }[] {
  const entries = Object.entries(MISSION_DECK.primaries).map(([d, missions]) => ({ disposition: d, missions }));
  return disposition ? [...entries.filter((e) => e.disposition === disposition), ...entries.filter((e) => e.disposition !== disposition)] : entries;
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
