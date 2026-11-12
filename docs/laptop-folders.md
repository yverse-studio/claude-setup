# Laptop folders (Claude user, Windows): the one home of the structure rules

Everything we work on lives under one root folder, each folder holds one kind of thing, each thing exists once.
**Everyone who works on the laptop, from a laptop thread or a cloud thread, starts at `START.md` in the root and follows this page.**
`START.md` is generated from `config/paths.json` and the real tree, so it is never stale. The test rules K1 to K3, N1 to N3 and
the render lock are in the project files, `plans/STUDIO-RULES-SPEC.md` (v5); this page does not repeat them.

## The root, and how a path is written

Root today = `C:\Studio`  (the only drive path allowed in this repo; this line carries the marker). <!-- path-lint: fixture -->

- The root is the **environment variable `STUDIO_ROOT`**, set once per machine. Not set = every tool stops with "set STUDIO_ROOT". No default.
- The folder names live in **one table, `config/paths.json`** (relative to the root). Scripts and hooks ask the resolver: `scripts/paths.mjs`
  (JavaScript), `scripts/paths.py` (Python), on the laptop `tools/laptop/root.py`. Nobody writes a drive path into a script or a doc.
- Docs, roles and skills write a path relative to the root (`lib/characters/CH_<name>/reference/`) or by name.
- **No symlink, no junction, no stub folder** for an old path: a stale path must fail loudly. Moving the root is one new value of
  `STUDIO_ROOT`; moving a folder is one changed line in `config/paths.json` plus the holders below.
- `scripts/paths-lint.test.mjs` (in `pre-pr.mjs` and CI) is red on a drive path, a home-folder path under the Users folder, a path through the
  profile's Documents folder, or an entry of `dead_names` in any tracked file. Test data carries the line marker `path-lint: fixture`;
  `docs/archive/**` is exempt. A move adds its old names to `dead_names` in the same change.

## The three rules

1. **One thing = one folder with fixed subfolders.** Figure, clothes, part, prop, room, animation, sound, scene: the same everywhere.
2. **The folder says WHAT a thing is, the catalog says its FORM.** Format, source, licence, 18+ and style are fields in `catalog.json`, never folders.
3. **A reference lives with the narrowest thing it is for:** one asset, else its group folder, else the scene, else the project.

| Subfolder | Holds (only present when it has content) |
|---|---|
| `Blend/` | the one active work file |
| `reference/` | what it should look or move like; one flat folder, optional name prefixes `owner_ face_ hair_ body_ outfit_ pose_ board_ cam_`; subfolders only in a group folder far above 20 files |
| `source/` | untouched download + licence |
| `export/<target>/` | finished output per target (`renpy`, `engine`, `vrm`, `video`, `tiktok`, `proxy`); generated, never edited |
| `gate/` | check images + `GATE.md` (score, date, link) + `gate.json` bound to the checked file's hash |
| `_archive/` | older states, never `_v2` beside the file |
| `gen/<shot>/` | videos only: one AI result per shot with its `params.json` |
| `edit/`, `render/` | videos only: the one edit file; generated, deletable intermediate renders |
| `STATUS.md` | state, the active file, next step |

No scripts inside an asset: data and at most one recipe file; build scripts live in `tools/`, scratch in `_claude/_work/`.

## Rules for every thread

1. **Start at `START.md`.** Every brief names this page.
2. **Never type a path.** Ask the resolver by name; docs write paths relative to the root.
3. **New things are created by a command:** `python tools/laptop/new.py <kind> <name>`, kind = `character`, `clothes`, `part`, `prop`, `room`,
   `anim`, `sound`, `scene`, `game`, `video`, `footage`. It makes the folder with its subfolders, `STATUS.md` from `tools/laptop/templates/<kind>/`, the catalog entry and the README row. A folder made any other way fails `tidy_check.py`.
4. **No kind yet = a rule change, not a folder:** one PR in claude-setup (the name in `config/paths.json`, its template, one line here). A new folder inside an existing pattern needs no yes; a new top-level folder or `lib` type needs the owner's. `.layout.json`, the `START.md` tree and `STRUCTURE-MAP.png` are regenerated after the merge.
5. **Friction flows back:** no home for a file, a misleading README or a false alarm = one line in `docs/logs/STRUCTURE-FRICTION.md` (date, what, where), then carry on in `_claude/_work/`. The Archivist turns the lines into rule PRs weekly; the blind test repeats after every rule change.
6. **Leave as found:** `tidy_check.py` green, own temp removed, `_claude/_queue/WHO.md` lines cleared, before "done".
7. **One home for the rules:** this page. Nobody keeps a second copy.
8. **Never create** a folder named `ref`, `refs`, `references`, `Image/ref` or a root `reference/`; a loose file at the top; a git worktree outside `_claude/_worktrees/`; a clone outside `repos/`.

## Tree

```
<STUDIO_ROOT>/        top level = exactly: lib projects repos tools docs inbox _claude .claude
│                     START.md AGENTS.md catalog.json catalog.json.sha256 deps.json .layout.json
├─ lib/               everything reusable, by type
│  ├─ characters/     CH_<name>/ (Blend/ reference/ export/ gate/ <name>.ychar.json STATUS.md) · CH_Base/female/ (reference/{face,body}/)
│  ├─ clothes/        CL_<name>/ (source/ files/ fitted/<figure>.blend reference/ gate/)   accessories as CL_acc-*
│  ├─ parts/          {hair,eyes,skin}/PT_<name>/ (source/ files/ reference/)
│  ├─ rooms/          <room>/ (<room>.blend reference/ export/ gate/)
│  ├─ props/          <category>/OB_<name>/ (source/ files/; furniture, office, street, travel, weapon) · nsfw/OB_<name>/
│  ├─ anims/          <sfw|nsfw>/<solo|pair>/<type>/ : sfw/solo/{locomotion,idle,gesture,action}/AN_<name>/ · sfw/pair/kiss/ · nsfw/pair/<position>/
│  │                  nsfw/reference/{boards,camera,poses,motion,contact}/
│  │                  _engine/ (pair engine: core, projects, docs) · _retarget/ (tools)
│  │                  _source/ (raw, read-only): free packs at the top, 18+ ones in nsfw/_source/{video,games}/
│  ├─ sounds/         {foley,ambience,human,music,ui}/SN_<name>/ · nsfw/
│  └─ footage/        <YYYY-MM-DD>-<shoot>/ (source/ export/proxy/ STATUS.md): his real shoots
├─ projects/          games/<name>/ videos/<YYYY-MM-DD>-<name>/ films/<name>/   README names its repo; STATUS.md
│  └─ games/<name>/   reference/look/ · ch<NN>/<scene>/ (<scene>.blend reference/ preview/ render/ gate/ STATUS.md)
│                     audio/{voice/<language>/<figure>/, mix/, music/, sfx/} · builds/<version>/ · marketing/{store,trailer,social/<post>}/
├─ repos/             only git clones, one per repo; README = table repo | remote | project
├─ tools/             laptop/ anim/ gate/ apps/ ai/ BLENDER_EXE.txt
│  └─ ai/             comfyui/ chatterbox/ MuseTalk/ liveportrait/ (one closed folder per tool, with its .venv) · models/{diffusion_models,text_encoders,vae,loras,hf}/ · MODELS.md
├─ docs/              guides/ logs/ PIPELINE.md INBOX.md
├─ inbox/             downloads land here, processed within 7 days by `asset-intake` (Character TD); _quarantine/ holds unlicensed ones
└─ _claude/           _worktrees/<repo>/<branch>/ _work/ _queue/ _archive/ trash/<date>/
the owner's own folders (Private18) stay in the Documents folder and are never touched
```

Technical folder names are English (`poses`, `motion`, `contact`, `camera`, `boards`, `face`, `body`). A video that advertises a game
lives in that game's `marketing/social/<post>/`; `projects/videos/` holds stand-alone channel content. Pair positions live in
`lib/anims/nsfw/pair/<position>/` (18+) or `lib/anims/sfw/pair/<name>/`; the engine that builds them is `lib/anims/_engine/` (owner 2026-11-12: rating, then cast, then type). The folder name is the asset's ID (`CH_rika`) and is never renamed after creation.

## AI tools and footage

1. **Weights live only under `tools/ai/`.** Shared ones in `tools/ai/models/` (ComfyUI reads them through `extra_model_paths.yaml`, everything from Hugging Face through `HF_HOME` = `tools/ai/models/hf`); weights a tool expects at a fixed place in its own folder (MuseTalk `models/`, LivePortrait `pretrained_weights/`, LatentSync) stay in `tools/ai/<tool>/`. A download anywhere else is a mistake. Before a new model: size, licence (EU), VRAM and place go into `tools/ai/MODELS.md`, then load it.
2. **Each AI tool is one closed folder `tools/ai/<tool>/`** (code, `.venv/`, pinned weights; the folder is named like its code, `MuseTalk`). A venv holds absolute paths, so a move rebuilds it. `TWIN_TOOLS` = `tools/ai`.
3. **The one symlink exception:** `tools/ai/models/hf/hub/` may hold the links the Hugging Face hub makes itself (`snapshots/` to `blobs/`); `tidy_check.py` allows it. We make no link ourselves.
4. **An AI result without `params.json`** (model, seed, workflow, inputs) does not count: it cannot be reproduced or gated.
5. **Raw footage stays as shot and stays on the laptop.** Editing makes a new file in `export/proxy/` or the video folder; the cloud gets only proxies (bt709, 1080p, parts of at most 10 MB with a hash list), built by the laptop lane when the video's thread asks.
6. **One shoot feeds many videos:** a video names `lib/footage/<shoot>/source/<clip>` in its `STATUS.md` and `params.json` and does not copy it (K1). A shoot's `STATUS.md` lists the clips, who is in them, HLG or not, `used_by`, and "original stays on the phone until <date>" (K2 is no disk backup).
7. **Back from the cloud:** at a video's gate PASS the laptop lane copies `export/tiktok/` and `gate/` (`GATE.md`, `gate.json`, the passed round's images) into `projects/videos/<slug>/`; the thread that got the PASS owns it. The cloud folder is a working copy.
8. 18+ stays outside, as everywhere (Private18).

## Copies, 18+, backup (summary; tests in the rules spec)

- **K1** One source (the file in the thing), any number of generated copies (`export/`, `render/`, `builds/`, the game repo's `game/`); a tool writes them, nobody edits them.
- **18+ never reaches a git server in any form.** Its repo has no remote and a hook that aborts any push; `nsfw/` exists only in `lib/anims`, `lib/props`, `lib/sounds`; the catalog field `rating` is the truth for scripts.
- **K2** Local snapshots to a `StudioBackup` folder next to the root, outside it, a restore system, not a disk-failure backup; `tools/ai/` is outside it (all of it reloads), `lib/footage/` only when the space allows. **K3** Dependencies (`deps.json`, `used_by`) are generated from the work files, never typed.

## From a cloud thread

A cloud thread has no files of its own on the laptop. When its work needs them:

1. **Reach the laptop** only through the one Remote Control lane (the coordinator starts it) or folder access that the project already approved. Laptop work from a cloud thread is routed there, never run twice in parallel.
2. **Start at `START.md`** in the root, then this page. Ask the resolver for paths; never copy a path out of an old chat or brief.
3. **Save with `new.py`**: a new thing is created by `python tools/laptop/new.py <kind> <name>` through the lane, then filled. No hand-made folders.
4. **Downloads go to `inbox/`** (top level of the root) and are processed within 7 days by the [`asset-intake`](../.claude/skills/asset-intake/SKILL.md) skill (Character TD: licence, fit on all bases, preview, `lib/`; no licence = `inbox/_quarantine/`); the untouched original is kept once in the `source/` of the main asset.
5. **Transfers are parts of at most 10 MB** (a laptop thread cannot fetch a project file over 16 MB); a bigger file is split with a hash list or rebuilt from its script and parameters.
6. **18+ never goes into a repo that has a remote**, in no form (image, text, code, bundle), and never into the cloud project files; it stays in `lib/`, `projects/` and the local snapshots.
7. A reference the owner sends himself is saved by the lane in the same turn, straight into the `reference/` of the thing it is for (rule 3 above); no review step. The Archivist indexes it only when asked.

## Path holders (the one list: what to update when a path changes)

Change the name in `config/paths.json` first, then work through the holders; generated holders are regenerated, never edited.

| Holder | How it follows |
|---|---|
| `config/paths.json`, `scripts/paths.mjs`, `scripts/paths.py`, the laptop's `tools/laptop/root.py` | the one table and its resolvers |
| `.layout.json`, the `START.md` tree block, `.claude/settings*.json` allow lines (`permissions-sync.sh`), `STRUCTURE-MAP.png` | generated from the table and the real tree |
| `catalog.json` + `docs/FIND.md` (`gen_find.py`), blend library and image links (`blend_refs.py`, `relink_libs.py`), git worktrees (`git worktree repair`) | the move tools, in one freeze with the move table and undo log |
| Snapshot config (K2), `tidy_check.py` (hub-link exception), the `new.py` templates (`footage` kind; `video` with `gen/ edit/ render/`) | laptop lane, same freeze |
| Flamenco (storage, `cxy_script_job.js`, worker config), the scene generator and `md2rpy` config, `tools/BLENDER_EXE.txt`, Desktop shortcuts, Windows scheduled tasks | laptop lane, same freeze |
| `START.md`, `AGENTS.md`, every `README.md`, `_claude/_queue/WHO.md`, `docs/handoff/*` | text, relative to the root |
| claude-setup: this page, `docs/MAP.md`, `AGENTS.md`, `global/rule-guard.mjs` and its copy in `cloud/setup.sh`, `scripts/guards.test.mjs`, `scripts/blender/*`, `scripts/cxy/*`, skills and docs that name a folder | one PR per path change; the lint keeps them clean |
| Cloud project files (`MAP.md`, `FIND.md`, `PROVEN.md`, `PIPELINE.md`, `STRUCTURE-MAP.png`), project memory, open thread briefs | the Archivist; the cloud files use the same `dead_names` |
| **Claude app: approved folders and the default folder** | the one manual holder (owner click in the project's folder settings); the old GitHub clone folder in Documents is dropped only after the studio migration confirms nothing there is still in use |
