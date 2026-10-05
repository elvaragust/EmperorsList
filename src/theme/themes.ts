import { useEffect } from 'react';

/**
 * Faction themes follow the list that is open; everywhere else uses the base
 * gothic theme. Matching is by faction name so it works for any data source.
 */
const THEMES: { match: RegExp; theme: string }[] = [
  { match: /black templars/i, theme: 'black-templars' },
  { match: /custodes/i, theme: 'custodes' },
];

export function themeForFaction(factionName?: string): string | undefined {
  if (!factionName) return undefined;
  return THEMES.find((t) => t.match.test(factionName))?.theme;
}

/** Apply a faction theme while the calling screen is mounted. */
export function useFactionTheme(factionName?: string) {
  useEffect(() => {
    const theme = themeForFaction(factionName);
    const root = document.documentElement;
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [factionName]);
}
