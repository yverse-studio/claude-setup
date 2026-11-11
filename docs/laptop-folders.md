# Laptop folders (Claude user, Windows)

One rule for every session, including OpenCode and Luna 2: **everything we work on lives under one root folder, each folder
holds one kind of thing, and each thing exists once.** The live map with today's contents is `START.md` in the root; this
page is the rule behind it.

## The root, and how a path is written

Root today = `C:\Studio` <!-- path-lint: fixture -->  (the only drive path allowed in this repo; this line carries the marker).

- The root is the **environment variable `STUDIO_ROOT`**, set once per machine (`setx STUDIO_ROOT <root>`). Not set = every
  tool stops with "set STUDIO_ROOT". There is no default path to fall back to.
- The folder names live in **one table, `config/paths.json`** (relative to the root). Scripts and hooks ask the resolver:
  `scripts/paths.mjs` (JavaScript) or `scripts/paths.py` (Python). Nobody writes a drive path into a script or a doc.
- Docs, roles and skills write a path relative to the root (`lib/characters/CH_<name>/reference/`) or by name.
- **No symlink, no junction, no stub folder** for an old path: a stale path must fail loudly. Moving the root is one new value of
  `STUDIO_ROOT`; moving a folder is one changed line in `config/paths.json` plus the holders below.
- `scripts/paths-lint.test.mjs` (runs in `pre-pr.mjs` and CI) is red on a drive path, a home-folder path under the Users folder,
  a path through the profile's Documents folder, or an entry of `dead_names` in any tracked file. Test data carries the line
  marker `path-lint: fixture`; `docs/archive/**` is exempt. A move adds its old names to `dead_names` in the same change.

## Tree

```
<STUDIO_ROOT>/
  START.md  AGENTS.md  catalog.json  .layout.json       nothing else loose
  lib/          assets by type
     characters/CH_<name>/   Blend/  reference/ (gesicht, haare, koerper, outfit, owner)  source/  Texture/  STATUS.md
     clothes/CL_*   parts/{eyes,hair,skin}/PT_*   props/OB_*   rooms/<room>/   anims/AN_*   sounds/   (18+: <type>/nsfw/)
  projects/     games/<name>/  videos/<name>/  films/<name>/      README names its repo
  reference/    only what belongs to no asset: posen, aussehen, animation, kamera, anleitungen, spiele, social-media, watch
  repos/        only git clones, one per repo; README = table repo | remote | project
  tools/        laptop/  anim/  gate/  apps/  BLENDER_EXE.txt
  docs/         how we work; logs/ = move tables
  _claude/      _worktrees/<repo>/<branch>/  _work/  _archive/  _queue/  _inbox/  _xfer/  trash/<date>/
the owner's own folders (Private18, ComfyUI, venv folders) stay in the Documents folder and are never touched
```

## Rules
- A new clone goes into `repos/`, a game build into `projects/games/<game>/build/`, new art into `lib/`, a reference tied to one
  asset into that asset's `reference/` folder, any other reference into `reference/` (18+ ones stay out of every git remote, see
  `docs/game-pipeline.md`). Never "somewhere next to it", never loose in the profile root.
- Git worktrees live only in `_claude/_worktrees/<repo>/<branch>/`. Downloads land in `_claude/_inbox/` and are sorted within 7 days.
- Before creating a file, know its home from `START.md`; no home = `_claude/_work/<job>/`. A new top folder or `lib` type needs the owner's yes.
- One asset, one folder, one active file; older state goes to that asset's `_archive/`.
- Move to `_claude/trash/<date>/` (deleting only under the owner's standing delete rule); a folder with a venv or a running tool or render job is not moved.
- A job ends with its temp files removed. Where the current file of a character, clip or scene lives and how work copies are
  archived: [One source, kept clean](game-pipeline.md#one-source-kept-clean).
- OpenCode and Luna 2 read `AGENTS.md` first, which points to `START.md`.

## Path holders (the one list: what to update when a path changes)

Change the name in `config/paths.json` first, then work through the holders; this page is their home, every other file links it.
Generated holders are regenerated, never edited by hand.

| Holder | How it follows |
|---|---|
| `config/paths.json`, `scripts/paths.mjs`, `scripts/paths.py`, the laptop's `tools/laptop/root.py` | the one table and its resolvers |
| `.layout.json` (allowed top-level names), `START.md` tree block, `.claude/settings*.json` allow lines (`permissions-sync.sh`) | generated from the table |
| `catalog.json` + `docs/FIND.md` (`gen_find.py`), blend library and image links (`blend_refs.py`, `relink_libs.py`), git worktrees (`git worktree repair`) | the move tools, in one freeze with the move table and undo log |
| Flamenco (job storage, `cxy_script_job.js`, worker config), the scene generator and `md2rpy` config, `tools/BLENDER_EXE.txt`, Desktop shortcuts, Windows scheduled tasks | laptop lane, same freeze |
| `START.md`, `AGENTS.md`, every `README.md`, `_claude/_queue/WHO.md`, `docs/handoff/*` | text, relative to the root |
| claude-setup: this page, `docs/MAP.md`, `AGENTS.md`, `global/rule-guard.mjs` and its copy in `cloud/setup.sh`, `scripts/guards.test.mjs`, `scripts/blender/*`, `scripts/cxy/*`, skills and docs that name a folder | one PR per path change; the lint keeps them clean |
| Cloud project files (`MAP.md`, `FIND.md`, `PROVEN.md`, `PIPELINE.md`, `STRUCTURE-MAP.png`), project memory, open thread briefs | the Archivist; the cloud files use the same `dead_names` |
| **Claude app: approved folders and the default folder** | the one manual holder (owner click in the project's folder settings) |
