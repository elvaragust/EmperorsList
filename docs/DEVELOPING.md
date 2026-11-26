# EmperorsList — developer notes

The user manual is the README in the repo root. This file is for working on the code.

An unofficial, free army builder and game companion for Warhammer 40,000 (11th edition), built as an installable offline web app (PWA).

The app ships with **no game data**. Each device downloads units, rules and points from a public community repo (BSData `wh40k-11e` by default) and caches them locally.

## Run it

Requires Node 18.18 or newer (22+ to also run the relay server test).

```bash
npm install
npm run dev        # http://localhost:5173, open on your phone via your computer's IP with `npm run dev -- --host`
npm test           # engine, search, sync and transfer tests
npm run build      # production build with offline service worker, output in dist/
npm run preview    # serve the production build
```

To run the server locally too (live games through the relay, move parcels):

```bash
npm ci --prefix server
VITE_RELAY_URL=/relay npm run build
PORT=8080 STATIC_DIR=dist DATA_DIR=./data node server/server.mjs   # http://localhost:8080
```

## Self-hosting

`Dockerfile` builds the app and a small Node server (`server/server.mjs`, one dependency: `ws`):

```bash
docker build -t emperorslist .
docker run -d -p 8080:8080 -v emperorslist-data:/data -e TRUST_PROXY=1 emperorslist
```

Put it behind a TLS reverse proxy (Caddy, nginx); WebSockets must be passed through (Caddy's `reverse_proxy` does). The server:

| Path | What |
|---|---|
| `/` | The built app, with SPA fallback. Hashed assets are cached for a year; the page, service worker and manifest are `no-cache`. |
| `/relay` | WebSocket relay for live games (see below). Keeps nothing. |
| `/api/transfer` | `POST` an encrypted move parcel (≤ `TRANSFER_MAX_MB`), `GET /api/transfer/<id>` to fetch it. Deleted after `TRANSFER_TTL_H`. |
| `/healthz` | `{ok, sockets, links}` |

Environment: `PORT` (8080), `STATIC_DIR`, `DATA_DIR` (`/data`), `ALLOWED_ORIGINS` (comma-separated other origins allowed to use the relay and upload parcels — e.g. the old GitHub Pages origin; same-origin is always allowed), `TRUST_PROXY=1` (take the client IP from `X-Forwarded-For` for rate limits), `TRANSFER_MAX_MB` (80), `TRANSFER_TTL_H` (48).

Build args: `BASE_PATH` (`/`), `VITE_RELAY_URL` (`/relay`; empty = PeerJS/WebRTC as on GitHub Pages), `VITE_EXTRAS_URL` (the Pages `wahapedia/` folder).

**What the server never does:** download, store or serve game data. Wahapedia extras (`scripts/wahapedia.mjs` etc.) are not run in the Docker build; the image reads them from the GitHub Pages copy instead (`VITE_EXTRAS_URL`, Pages allows cross-origin reads). Without them the app still works and players can import the CSVs in Settings.

## Build-time switches

| Variable | Effect |
|---|---|
| `BASE_PATH` | Path the app is served from (`/EmperorsList/` on Pages). |
| `VITE_RELAY_URL` | Live games go through this relay (`/relay`, or a full `wss://…/relay` to share one relay between addresses). Unset = PeerJS. |
| `VITE_EXTRAS_URL` | Where stratagems, Core Rules and mission text are read from. Unset = `wahapedia/` next to the app. |
| `VITE_NEW_HOME` | The app has moved: shows a *new home* banner and *Move my data* pointing at this address. |

The Pages workflow passes the repo variables `RELAY_URL` and `NEW_HOME` (Settings → Secrets and variables → Actions → Variables) through to these, so the old address can use the new server's relay and point players at it without code changes.

To install on a phone: open the app in Safari (iPhone) or Chrome (Android) and use "Add to Home Screen". It then runs full-screen and works offline.

## What works

**Builder (phases 1–2)**
- Pick any faction from the data repo; it downloads with everything it links to (game system, parent and library catalogues) and is cached for offline use
- New list wizard: faction → battle size → detachments (Detachment Points shown) → Force Disposition and name
- Roster grouped by role, points vs limit, DP and Enhancement counts, issues that explain themselves with a fix button
- Add unit with closest-match search and role filters; units start with the data's default models and wargear
- Wargear editor driven by the data: unit sizes, choose-one groups, per-option limits, points brackets, "split one off" to give a single model different gear
- Leaders and Support: attach a character to the units its ability lists; the combined unit shows one weapon grid and the leader's abilities, tagged when they buff the unit
- Warlord and Enhancements as the data offers them (only the chosen detachment's enhancements show)
- Copy limits, battle-size limits, Battleline doubling, detachment restrictions, "must be attached" and so on all come from the data's own constraints and modifiers — one generic rules engine, no per-faction code
- Notice when the game data changed since a list was built

**Reference (phase 3)**
- One search over rules, units, abilities, enhancements, detachments, keywords and imported stratagems; colour-labelled and closest match first
- Every keyword and weapon ability in rules text, weapon tables and datasheets is tappable for its definition
- Faction pages (army rules, detachments with rules/enhancements/stratagems, datasheets) and core rules A–Z
- Stratagems from Wahapedia: Settings → Extra rules imports the export CSVs (`node scripts/wahapedia.mjs` downloads them). Credited "Powered by Wahapedia"

**War Journal (phase 4)**
- Setup: army, opponent (name, faction, their pasted list), mission/deployment/first turn, secondaries, pre-battle checklist built from your list (Warlord, unattached leaders, Deep Strike/Infiltrators/Scouts, pre-battle abilities)
- Battle: round/turn/phase tracker, CP for both players (+1 each Command phase), VP grid per round, stratagems for the current phase and turn with a spend button, your abilities that mention the phase, per-unit casualty grid, log and notes
- Result screen with win/loss/draw record

**Extras (phase 5)**
- Import the official app's text export (matches units, models, wargear, Warlord, Enhancements, detachments; reports anything it couldn't match)
- Export in the same text layout, share link and QR code (ids and counts only), printable datacards
- Collection: owned/built/painted per datasheet, and "can I field this list?"
- Backup and restore everything to a file
- Themes for every faction (follow the open list)

**Live games**
- Play → Host live game shows a room code and QR; other phones scan it (or Play → Join and type the code)
- 1v1, 2v2, 2v1 or a three-player free-for-all. Turn, phase, CP (per player or one pool per team), VP per team, each team's primary and secondaries and a shared log sync between phones; each player's units-left are shown to the others
- The host's phone is the referee (`src/sync/room.ts`), so it must stay open. Guests keep an outbox of numbered actions the host replays once each
- Transport is pluggable behind `PeerLike`/`ConnLike`: with `VITE_RELAY_URL` set, `src/sync/relay.ts` sends everything over one WebSocket to the server (works on any network, dead phones noticed within seconds); otherwise PeerJS/WebRTC with the free public PeerJS server introducing the phones. Optional own PeerJS server in Settings → Live games
- Liveness, both ways: the host sends `beat` and guests send `ping` every 5 s; a side that hears nothing for 15 s drops the link and redials (guest) or forgets it (host). The relay adds a server-side ping and a 10 s `tick` so a dead socket is noticed on the phone too
- Tests: `src/engine/__tests__/liveRoom.test.ts` (fake network, including links that die without closing) and `src/sync/__tests__/relay.test.ts` (the real server)

**Moving address**
- `src/data/transfer.ts`: packs the backup, cached data files and imported rules, gzips, AES-GCM-encrypts with a random key, uploads to the new address's `/api/transfer`; the key travels only in the link's `#fragment`. Receiving merges (`applyRestore('newer')`, data files only where missing, source records only where none)

**Wahapedia extras**
- The Pages workflow runs `scripts/wahapedia.mjs dist/wahapedia` after building (and daily on a schedule), so the CSVs are published next to the app; the app imports them on startup (`src/data/bootstrap.ts`). Locally there are none; use Settings → Extra rules → import

**Table layouts**
- Play → Table layouts: save photos or screenshots of terrain/deployment layouts and pick them when setting up a game

## Hosting on GitHub Pages

`.github/workflows/pages.yml` builds and publishes the app on every push to `main`.
One-time setup: on GitHub open the repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The app is then at `https://<user>.github.io/<repo>/` — open it on your phone and use "Add to Home Screen".
Locally the app runs at `/`; the workflow sets `BASE_PATH` to `/<repo>/` for Pages.

## Real-data tests

Game data is never committed. To run the engine against real data:

```bash
node scripts/fetch-data.mjs                     # Black Templars + linked files into ../data-cache
node scripts/fetch-data.mjs "Necrons" "Orks"    # more factions
npm test                                        # the real-data suite runs when the files exist
```

## Known gaps

- The default data source, `BSData/wh40k-11e`, is offline (all BSData 40k repos return 404 since late 2026). Cached data keeps working and is never removed for an unreachable source; new devices need a move parcel or another source (Settings → Advanced)

- Modifiers that change other entries' profiles (New Recruit "affects", mostly Crusade upgrades) are not applied yet
- Mission cards are typed in by hand (not in BSData or Wahapedia's export)
- QR scanning is not built in; use the phone camera on a shared QR, or paste the link
- The rule-label style is still the placeholder (`LABEL_VARIANT` in `src/ui/RuleLabel.tsx`) until one of the 8 options is picked

## Layout

```
src/
  engine/      Pure TypeScript rules engine. No React, no browser APIs. Fully unit-tested.
    bsdata/    Raw BSData shapes, index/link resolution, XML -> JSON normaliser
    rules/     The generic BattleScribe engine:
      nodes.ts        options with entryLinks merged onto their targets
      instance.ts     a roster as an instance tree (roster → force → units → models → wargear)
      evaluate.ts     conditions, repeats and modifiers (hidden, costs, limits, names, categories)
      rosterEngine.ts points, limits, option views, leaders, validation issues
      edit.ts         defaults, set counts, split models (immutable updates)
      config.ts       battle size, detachments, Force Disposition
      models.ts       model loadouts for the grid, datasheet parts
      glossary.ts     definitions for tapped keywords
    weaponGrid.ts   The models × weapons grid and totals
    listText.ts     Official-app text export/import
    share.ts        Compact share payload
    wahapedia.ts    Wahapedia CSV import
    game.ts         War Journal turn order and scoring
    types.ts        App model: rosters store ids and counts only
  data/        IndexedDB (Dexie): rosters, games, collection, cached data files; GitHub data download
  search/      MiniSearch index with exact > starts-with > word > fuzzy > text ranking
  theme/       Design tokens (CSS variables) and faction themes
  ui/          Shared components (tab bar, screen frame, rule label)
  screens/     One folder per tab
```

See `docs/ARCHITECTURE.md` for the design rules every change should follow.

## Legal

EmperorsList is a fan project, not affiliated with or endorsed by Games Workshop. Warhammer 40,000 and related names are trademarks of Games Workshop Limited. Do not commit game data, rules text, art or logos to this repo.
