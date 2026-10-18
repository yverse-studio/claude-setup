# __NAME__

A three.js game made by claude-setup's `new-project` workflow (`"kind": "game"`). The starter is a
30-second coin dash: replace `src/rules.ts` (rules, tested) and `src/main.ts` (scene, input) with
the real game; the deploy wiring stays as it is.

- Before the first build: 3 to 6 captures of the genre's top games on the portal into `design/reference/`, `DESIGN.md` written from them (`operator/roles/designer.md`, Art direction first in claude-setup; `ui-review` `design-check.mjs` must pass).
- `npm install`, `npm run dev` (Vite), `npm run verify` (what CI and Workers Builds run)
- Live: `https://__NAME__.<account>.workers.dev`, every other branch a Worker Preview
- Play and screenshot it in a browser: `game-3d` skill in claude-setup (section 4)
- New game: fill `test/game.mjs` (bot `decide`, `min`, `spots`) and `src/hooks.ts`; `scripts/play.mjs` and
  `scripts/shots.mjs` read nothing else. `npm run play` / `npm run shots` build first, then play or
  screenshot at 390 and 1440 (`-- [url] [--out dir]`).
- A page opened with `?paused=1` paints only inside `advanceTime()`, and CSS fades run on the real clock:
  take a shot only after `settle(page)` in `scripts/lib.mjs` (paint once, wait 700 ms).
- `build` writes `src/commit.js` only on Workers Builds, so a local build or `npm run verify` never dirties the tree.
- Update a branch with `git merge --ff-only origin/<branch>`: `git reset --hard` is refused by the safety check.
