# Architecture rules

Short rules for anyone (human or AI) changing this code. The full plan, with reasons, is the "EmperorsList — Technical Plan" doc.

1. **The engine is pure.** `src/engine` has no React, DOM, fetch or IndexedDB imports. It takes data in and returns plain objects, so it can be tested in Node and reused (for example in a Capacitor build or a CLI).
2. **No game data in the repo or the bundle.** Data is downloaded at runtime by `src/data/dataPacks.ts` and cached in IndexedDB. Test fixtures are made up and only mirror the shape of BSData files.
3. **User data stores ids and counts only.** A roster points at BSData entry ids. Exports and share links carry no rules text.
4. **Record the data version.** Every roster stores the data commit it was built with, so a data update can show what changed.
5. **One rules engine for everything.** Building, playing and any tournament check use the same validation code, so they can never disagree.
6. **Every issue explains itself.** Validation returns what is wrong, why (with numbers) and a suggested fix.
7. **Theme through tokens only.** Components use CSS variables from `theme/tokens.css`; a faction theme only overrides variables.
8. **Offline first.** Every screen must work with no network once data has been downloaded once.
9. **Pinned versions, Node 18.** Dependencies are pinned exactly and must run on Node 18.18+.
10. **No per-faction code.** Everything a faction does (sizes, limits, points brackets, detachment restrictions, leaders) comes from the data's own constraints, conditions and modifiers through `engine/rules`. If a rule is wrong, fix the evaluator or report the data, don't special-case a faction.
11. **Build a new engine after every change.** `RosterEngine` memoises per instance; screens create one per roster object (`useRosterEngine`). Edits are immutable (`engine/rules/edit.ts`) and go through `saveRoster`, which refreshes cached names and points.
