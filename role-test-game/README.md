# Kofferlauf (role-test-game)

A cheap role test game (issue #732): its only job is to prove which role loads which skills, cards and rules. It lives as a folder in claude-setup because the `new-project` route was blocked (PROJECTS_GITHUB_TOKEN 401, no laptop repo) and yskills said a cheap scene in an existing repo is fine. It is not deployed: no Worker, no live URL.
One screen: a figure walks a 24 x 24 m street plot and collects five suitcases before 60 seconds run out.
Design: `design/GDD.md`, `design/UX.md`. Style `real` (a ready third-party figure, grey boxes), no sound, no tracking.

- From this folder: `npm install`, `npm run dev` (Vite), `npm run verify` (types, tests, build)
- `npm run bot`: the bot plays layouts 1 to 5 in headless Chromium and fails unless every one is cleared with at least 15 s left
- `npm run play` / `npm run shots` (`-- [url] [--out dir]`): one bot round, or screenshots at 390 and 1440 px
- `BASE_URL=<url of vite preview or dev> npm run journey`: the Tester's journey (`scripts/journey.mjs`, steps 1 to 13 of the gate)
- Controls: WASD or arrows (by key code), Shift toggles run, right-drag or Q/E turns the camera, Esc or P pauses, R restarts after a run; touch: floating stick on the left half, drag on the right half; standard gamepad.
- `?seed=<1-5>` pins a layout (without it the layouts cycle run by run); `?paused=1` makes `advanceTime(ms)` the only clock.
- Hooks for bots and testers: `render_game_to_text()`, `advanceTime(ms)`, `__playInput(x, z)`, `__lookBy(dx, dy)`, `__stats()`, `__gameReady`.
- Assets: `assets/manifest.json` has a row (name, sha256, licence, rating) for every file; `node scripts/check-assets.mjs assets/manifest.json` and `test/assets.test.mjs` check it.
- The figure ships as the FBX it came as (Rocketbox, MIT), not as VRM: a written exception to `game-3d` section 3 ("VRM only"), the same way `vacation-game` ships it. Its textures are set from the three shipped images in `src/assets.ts` because the FBX points at seven `.tga` files by Windows temp paths that do not exist.
- A page opened with `?paused=1` paints only inside `advanceTime()`, and CSS fades run on the real clock: take a shot only after `settle(page)` in `scripts/lib.mjs`.

Setup-Probe 23.11.
