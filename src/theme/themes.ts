import { useEffect } from 'react';

/**
 * Faction themes follow the list that is open; everywhere else uses the base
 * gothic theme. Matching is by faction name so it works for any data source.
 */
const THEMES: { match: RegExp; theme: string }[] = [
  { match: /black templars/i, theme: 'black-templars' },
  { match: /custodes/i, theme: 'custodes' },
  { match: /ultramarines/i, theme: 'ultramarines' },
  { match: /blood angels/i, theme: 'blood-angels' },
  { match: /dark angels/i, theme: 'dark-angels' },
  { match: /space wolves/i, theme: 'space-wolves' },
  { match: /salamanders/i, theme: 'salamanders' },
  { match: /raven guard/i, theme: 'raven-guard' },
  { match: /iron hands/i, theme: 'iron-hands' },
  { match: /imperial fists/i, theme: 'imperial-fists' },
  { match: /white scars/i, theme: 'white-scars' },
  { match: /deathwatch/i, theme: 'deathwatch' },
  { match: /grey knights/i, theme: 'grey-knights' },
  { match: /sororitas/i, theme: 'sororitas' },
  { match: /mechanicus/i, theme: 'mechanicus' },
  { match: /astra militarum/i, theme: 'astra-militarum' },
  { match: /chaos knights/i, theme: 'chaos-knights' },
  { match: /imperial knights/i, theme: 'imperial-knights' },
  { match: /agents of the imperium/i, theme: 'agents' },
  { match: /death guard/i, theme: 'death-guard' },
  { match: /thousand sons/i, theme: 'thousand-sons' },
  { match: /world eaters/i, theme: 'world-eaters' },
  { match: /emperor's children/i, theme: 'emperors-children' },
  { match: /daemons/i, theme: 'daemons' },
  { match: /chaos space marines|heretic astartes/i, theme: 'chaos' },
  { match: /necrons/i, theme: 'necrons' },
  { match: /orks/i, theme: 'orks' },
  { match: /genestealer/i, theme: 'genestealer-cults' },
  { match: /tyranids/i, theme: 'tyranids' },
  { match: /t'au|tau empire/i, theme: 'tau' },
  { match: /drukhari/i, theme: 'drukhari' },
  { match: /aeldari|craftworlds|ynnari|harlequins/i, theme: 'aeldari' },
  { match: /votann/i, theme: 'votann' },
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
