---
name: game-3d
description: "Build a 3D game with three.js (Electron for Steam): engine, layout, asset and VRM pipeline, test recipe, Steam checklist. Use for any 3D game or walkable world."
---

# 3D game

Decided 2026-10-07 (plan: `/mnt/project-files/game-dev/PLAN.md` in the Claude Setup project).
The HQ office is the test run; the first real game turns yskills' vacation photos and stories
into a cozy walk-around game that can go to Steam.

**Starter kit, read once at project start:** [`starter/README.md`](starter/README.md): chibi
roadmap, figure pipeline, standard models with licences, and the learnings from Company XY's figures.

## 1. Engine: three.js, Electron for Steam

Threads run in cloud Linux containers with Chromium and no screen, so the engine must run and
be looked at headless. three.js does; Unity, Unreal and Godot need an editor or a GPU on
yskills' PC for every visual check, so they are out (Godot stays the fallback if a game ever
needs consoles). Electron ships the same Chromium we test in; `steamworks.js` gives achievements,
cloud saves and the overlay. Vampire Survivors, CrossCode and GoreScript shipped this way.
Trade-offs to say in PLAN.md: about 250 MB download, no consoles, no photo-real graphics.

Stack (versions checked on npm 2026-10-07; take the current ones): `three` 0.186,
`@pixiv/three-vrm` 3.5, `three-mesh-bvh` 0.9 (collision against the level), `@dimforge/rapier3d-compat`
0.21 only when a game needs real physics, `@sparkjsdev/spark` 2.3 (Gaussian splats), Vite +
TypeScript, Vitest, Playwright, `electron` 44 + `electron-builder` + `steamworks.js` 0.4,
`@gltf-transform/cli` to shrink models. All MIT or Apache. Start on WebGL; switch a game to the
WebGPU renderer only when its scenes need it (Electron and every browser run WebGL).

## 1b. From a wish to a build brief (reference first)

yskills says what they want in one sentence, pictures or a story; the team turns it into a
concrete brief before any build. Order, every time:

1. **Find the bar.** WebSearch the most popular games or features of that kind (Steam top
   sellers and reviews, itch.io, YouTube devlogs): what players praise, what they complain about.
   Pick the three to five patterns that make the best ones good (camera, controls, pacing, art
   direction, onboarding), with a link each, in `design/REFERENCES.md`.
2. **Write the brief** into `PLAN.md`: the wish in yskills' words, the references and the
   patterns taken from them, the places and characters, the story beats as quests, the look
   (`design/DESIGN.md`, cozy pastel unless the wish says otherwise), the slices with acceptance
   criteria in `features.json`, the Steam decision (yes or later), and prices for anything that
   costs money. Open questions get one recommended pick and a card.
Literal mode (yskills, 2026-10-07): what they say is an order, done as said, at once. A named
model, a link, an asset: use it, no "yes but", no alternatives unless asked. Shortest reply that
answers. No subagents, research or screenshots beyond what the slice needs.

3. **Build to that bar**: the gate's `design-critic` gets the references next to the
   screenshots; a slice that falls short of them is not 5/5.

Pictures and stories are inputs, never the art: photos become references and splat postcards
(§3), stories become `story/` files.

## 2. Folder layout

**New game: `projects/<name>.json` with `"kind": "game"`, then the `new-project` workflow** (`publish`
skill): a static Vite + three.js repo (a 30-second coin dash to replace, rules in `src/rules.ts` with
Vitest, `window.__gameReady` for `templates/shots.mjs`), live at `https://<name>.yverse.workers.dev`,
no D1, no login. Its layout below is what you grow it into. Without the workflow, one repo per game,
scaffolded with the `scaffold` skill (Vue is optional: a game is a Vite app
whose `index.html` holds one canvas; i18n, legal pages, CI and the Worker Preview stay).

```
assets/manifest.json     every file: name, path, source, licence, author, usedFor (templates/manifest.json)
assets/characters/<n>/   model.vrm + licence.json copied from the VRM meta
assets/moves/            *.vrma shared by all characters (or Mixamo .fbx, retargeted at load)
assets/kits/<kit>/       CC0 kit models as .glb, one folder per kit
assets/splats/<place>/   .spz or .ply made from photos
assets/audio/
story/                   <place>.de.md, <place>.en.md, quests.json, i18n lines
src/platform/            platform.ts (interface), web.ts, steam.ts (steamworks.js)
src/scenes/<place>/      layout, lights, spawn and camera spots
src/entities/            player, npc, prop
src/systems/             walk, camera, dialogue, quests, save
src/ui/                  panels: one open at a time, Esc or a tap outside closes
tests/unit/ tests/shots/ tests/perf/
electron/                main.mjs, preload.mjs (templates/electron-main.mjs), electron-builder.yml
steam/                   app_build.vdf, depot vdfs, store texts de/en, capsule images
```

`vite.config.ts` builds twice: `base: '/'` for the Worker Preview and `base: './'` for Electron
(it loads over `file://`). Game rules (quests, saving, scoring) live in plain TypeScript with no renderer import, so Vitest
covers them. Stories are data: threads turn yskills' messages into `story/` files, never code.

## 3. Assets and characters

- **No file without a manifest row.** `node scripts/check-assets.mjs assets/manifest.json`
  fails on a file with no row, a row with no file, or a licence that forbids a paid game
  (CC-BY-NC, personal use, VRM meta `commercialUsage: personalNonProfit`). It runs in `verify`.
- **Characters: VRM only** (why: `research/characters-formats.md`). A model may be loaded from
  a link (VRoid Hub, BOOTH, a shared card) at runtime: the game shows the VRM meta (author,
  commercial use, allowed users) before use and refuses one that forbids games. Make or remix in VRoid
  Studio (free), pick from VRoid Hub, BOOTH or Sketchfab after reading the licence; the game
  refuses a model whose VRM meta forbids games. Ten original roster characters, never look-alikes.
- **Moves are shared files**, not baked into models: VRMA from vrm.dev, or Mixamo FBX (free
  with an Adobe account, unmaintained) retargeted at load with `vrm-mixamo-retarget` or
  three-vrm's `loadMixamoAnimation` example; Quaternius Universal Animation Library is CC0.
- **Places**: build from CC0 kits (Kenney, Quaternius, Poly Haven) in the project's DESIGN.md
  taste, with the photos as references. Shrink every .glb in CI with gltf-transform (meshopt or
  Draco, KTX2 textures at most 2048 px).
- **Splats** (3D photos): 30 to 200 photos of one place, trained on yskills' PC (Postshot,
  Windows + NVIDIA: free plan trains, export needs Indie 17 €/month; Brush is open source) or a
  paid service, loaded with Spark as vistas and photo spots. No collision: never a floor.
- **AI props**: Meshy (free tier CC-BY, 20 $/month for commercial), TRELLIS.2 (MIT, needs a
  GPU); Tripo's free tier is non-commercial. One prop at a time, cleaned in the style pass.
- Spending on assets or services needs yskills' word first (CLAUDE.md money rule).

## 4. Testing in cloud threads

- **Unit**: Vitest on the rules, no renderer.
- **Screenshots**: `templates/shots.mjs` runs the installed Chromium
  (`/opt/pw-browsers/chromium`) with `--use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist`, a fixed clock and seed (`?t=<unix>&seed=1`), and the scene's camera
  spots at 390 and 1440 px. New shots go through `design-critic`; the PR shows them.
- **Play it, not just look at it**: a game exposes three hooks (`src/hooks.ts` in the starter):
  `window.render_game_to_text()` (the visible state as JSON: mode, score, time, positions),
  `window.advanceTime(ms)` (play that much game time at once; open the page with `?paused=1` so it
  is the only clock) and `window.__playInput(x, z)` (hold a direction). `test/bot.mjs` decides from the
  text, `npm run play -- [url]` (`scripts/play.mjs`, copy both into an older game) plays a whole round,
  keeps three screenshots and fails on a page error, a round that never ends or a score under the bot's
  `min`. Run it on the Worker Preview before every gate; add each new state a bot needs to the text.
  QA after every slice, not at the end (idea from OpusGameLabs/game-creator, written in our words).
- **Perf budget per scene** (`tests/perf`, reads `renderer.info` after one frame): under 300
  draw calls, under 500 000 triangles, textures at most 2048 px, assets under 150 MB in total.
  SwiftShader cannot measure frame rate: yskills' PC runs the perf scene once per milestone and
  the number goes into PROGRESS.md.
- **Electron smoke**: CI runs the packaged app under `xvfb-run`, waits for the first frame and
  quits; Steam calls are stubbed outside Steam (`platform/web.ts`).
- **Gate preview**: the web build deploys to a Worker Preview like every project, so the
  evaluator plays the branch in a browser.

## 5. Steam checklist

| Step | Who | Cost or time |
|---|---|---|
| Steamworks partner account (partner.steamgames.com): identity, bank, tax interview (W-8BEN, needs a Gewerbe) | yskills | free |
| Steam Direct fee per game | yskills | 100 $, back after 1 000 $ revenue |
| Store page: capsules 920×430, 462×174, 1232×706, 748×896, 600×900; 5 screenshots 1920×1080; trailer; texts de + en | threads make, yskills uploads | 1 to 5 days review |
| Content survey (gives the IARC label; without it the game is hidden in Germany) | yskills, from the thread's draft answers | free |
| Coming-soon page live 2 weeks; release at the earliest 30 days after the fee | calendar | |
| Builds: Windows + Linux depots (Linux covers Steam Deck), `electron-builder --dir`, uploaded by `steamcmd` through the `steam-deploy` action (`templates/steam-deploy.yml`) with a builder account whose Steam Guard config is a repo secret | yskills makes the builder account once; threads do the rest | free |
| Build review, release click | yskills | 1 to 5 days |
| Money: Steam keeps 30 %, pays monthly by bank; Gewerbe income, Kleinunternehmer is fine | yskills | |

Only yskills' hands: account, tax interview, fee, first upload, release click. Everything else
is a thread's job; when yskills must act, give the exact Steamworks page and the field names.

## 5b. Tools: what is installed and why (checked 2026-10-07)

Plugin directory, skills.sh and the ECC index were searched (`toolbox` `find.mjs`,
`SearchPlugins`, `SearchSkills`). Nothing in the Anthropic Directory fits a cloud three.js
team: the Unity plugin is for Unity, CellCog and Mojulo are generation services. One candidate
to read on the PC later: `parallax-threejs` (community: three.js and GLSL debugging, visual
regression tests; needs its own MCP servers). The two best community skill packs were read in
full and vendored as text into `refs/` (licences in `THIRD_PARTY.md`); a game thread reads the
ones its slice needs:

| Folder under `refs/` | Use it for |
|---|---|
| `gamedev-skills/threejs-scene-setup`, `threejs-gltf-loading`, `threejs-materials-lighting` | current three.js API (r186: `setAnimationLoop`, `Timer`, physical lights, DRACO/Meshopt/KTX2) |
| `gamedev-skills/camera-systems`, `game-feel`, `level-design`, `audio-design` | the follow camera, juice, pacing, adaptive music |
| `gamedev-skills/performance-optimization` | frame and asset budgets (engine-neutral) |
| `gamedev-skills/steam-publish` | SteamPipe, depots, branches, store page (engine exports there are Godot/Unity; our Electron path is §5) |
| `threejs-game-skills/threejs-gameplay-systems` | Vite + TypeScript scaffold (`assets/threejs-vite-game`), physics choice, genre notes |
| `threejs-game-skills/threejs-aaa-graphics-builder` | `references/visual-scorecard.md`: the 10-point look check the design critic uses with the references |
| `threejs-game-skills/threejs-qa-release` | Playwright canvas inspector, bot playtest, release checks |

Libraries are per game via npm (§1); nothing global to install. Blender's official connector
(PC only) and VRoid Studio stay yskills' PC tools (`toolbox` catalog `data-web.md`). When a
better tool appears, fix this table and the catalog, not a thread's memory.

## 6. Lessons

- 2026-10-07 (HQ characters): test every loaded model in a browser with a real sample file before
  review. VRM 0 models face +z, so their bones' x and z rotations mirror (arms came out flipped,
  fingers flat, a wave that pointed). Walkers need A* over a floor grid from the furniture boxes,
  giving way instead of overlap, a stride that follows distance walked, ease in and out at about
  1 m/s; prove it headless by tracking the closest two walkers. A dialogue scene puts the card
  beside the speaker, never over her. Base64 text grows a third: size upload caps accordingly.
  Convert hex colours with `convertSRGBToLinear()` under sRGB output and keep tone mapping off on
  pastel scenes.

- 2026-10-07 (HQ office, test run): a walkable room needs a real third-person controller
  (capsule against the room mesh with three-mesh-bvh, keyboard plus touch stick, a follow camera
  that never clips through walls); moves as shared VRMA files; every model through the manifest
  with its licence shown; perf budget and fixed-clock screenshot spots in the tests; scene,
  entities and systems kept apart so the office lifts into a Vite game unchanged.
