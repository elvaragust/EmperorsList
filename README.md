# EmperorsList

An unofficial, free army builder and game companion for Warhammer 40,000 (11th edition), built as an installable offline web app (PWA).

The app ships with **no game data**. Each device downloads units, rules and points from a public community repo (BSData `wh40k-11e` by default) and caches them locally.

## Run it

Requires Node 18.18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173, open on your phone via your computer's IP with `npm run dev -- --host`
npm test           # engine and search tests
npm run build      # production build with offline service worker, output in dist/
npm run preview    # serve the production build
```

To install on a phone: open the app in Safari (iPhone) or Chrome (Android) and use "Add to Home Screen". It then runs full-screen and works offline.

## What works in this first scaffold

- Five-tab shell (Lists, Reference, Play, Collection, Settings) in the gothic theme
- Unlimited lists stored on the device (create, duplicate, delete)
- Faction themes that follow the open list (Black Templars, Custodes)
- The unit weapon grid from the paper sketch, with merged identical models, removing a model and undo
- Search with closest-match-first ranking and rule-type labels
- Settings → Data sources downloads the 11th-edition game data from GitHub into the device cache
- Engine: BSData JSON and XML loading, model loadouts and weapons for real units, army-level validation that explains each issue

## Layout

```
src/
  engine/      Pure TypeScript rules engine. No React, no browser APIs. Fully unit-tested.
    bsdata/    Raw BSData shapes, index/link resolution, XML -> JSON normaliser
    loadouts.ts     Model loadouts and weapon profiles for a unit
    weaponGrid.ts   The models × weapons grid and totals
    validate.ts     Army-level checks with plain-language reasons
    types.ts        App model: rosters store ids and counts only
  data/        IndexedDB (Dexie): rosters, games, collection, cached data files; GitHub data download
  search/      MiniSearch index with exact > starts-with > word > fuzzy > text ranking
  theme/       Design tokens (CSS variables) and faction themes
  ui/          Shared components (tab bar, screen frame, rule label)
  screens/     One folder per tab
  sample/      Demo data from the paper sketch (not game data)
```

See `docs/ARCHITECTURE.md` for the design rules every change should follow.

## Legal

EmperorsList is a fan project, not affiliated with or endorsed by Games Workshop. Warhammer 40,000 and related names are trademarks of Games Workshop Limited. Do not commit game data, rules text, art or logos to this repo.
