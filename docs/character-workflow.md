# Character workflow

One fixed way to make a character and to show yskills a 3D model. Every figure brief, build and
gate follows it; nobody switches the order.

**Body fixes go into the base, characters only get details** (yskills 2026-10-26, fixed): see [`base-delta.md`](base-delta.md)
for the delta, the rebuild, the scale-1 rule and the proof before touching a body.

## Why

Company XY's figures are not one-offs. The work builds a repeatable character-generation
workflow and a library (bases, hair, outfits, clips, tools) that every later character and
project reuses: the next figure should take a brief and a picture, not a new invention. In
2026-10-08 the process switched around (VRoid samples instead of the chosen characters, a model
file taken as "the basis", pictures without the reference beside them, eyes that vanished in the game),
and yskills had to say it twice. This page is the fix.

## Body, then outfits (the fixed order)

**Step 0, before any model (companyxy 2026-11-12: about 20 fit rounds):** the character has an approved cast sheet with measures and an owner-card look lock ([`preproduction-workflow.md`](preproduction-workflow.md), template [`templates/character-bible.md`](templates/character-bible.md)); `node scripts/pipeline-gates.mjs sheet <SHEET.md>` must say OK. The brief names `Sheet:` and `Look-Lock:` (team-guard blocks one without). The gates below (fit against every `BT_` and `CH_` state, look switches per state via `scripts/blender/look_switches.py`, driver dump check, fresh `thumb.jpg`) are listed in [`gate.md`](../.claude/skills/operator/gate.md), Asset PRs, Pipeline gates.

The one order for every character, in every plan and masterplan (yskills 2026-11-12: "erst body perfekt dann
outfits", "das hätte der workflow sein müssen klar einfach und direkt"):

1. **Pick the body.** One line per character: which base body, which preset and slider values. Where yskills has
   not decided it in writing, one card to him with the options side by side. Never a guess.
2. **He approves the body.** Bare, with the style numbers of the gate's silhouette row (`gate.md`, Asset PRs).
   Until then no garment is fitted or fixed on her.
3. **Outfits on that body.** An existing gate-passed outfit first, fitted through the sliders and follow keys
   (`docs/clothing-pipeline.md`, Reuse first); a new garment only when nothing fits.

## The steps, in order

1. **Reference.** One picture per character, named after her, in
   `/mnt/project-files/<project>/references/named/<slug>.png`, listed in `references/README.md`
   (character, series, original file). "Basis" always means the character in that picture, never
   a model file. No reference picture, no build.
   For a 3D build add a turnaround: front, side and back, orthographic, same scale, lined up
   (an image generator may make it; check the views line up before using it). The builder
   measures against it instead of guessing from one perspective picture.
2. **Brief.** One thread per figure (`Programmer · <Name> figure`). The brief names the reference
   file and lists what is off, biggest first (eyes, hair, face, skin, body, outfits), from a
   diagnosis sheet: reference beside the current render.
3. **Build with the shared pipeline** (in company-xy: `tools/vrm/README.md`, Layer rule and
   Quality bar):
   - Start from the best free base in the library, never from scratch; keep its proportions.
   - Layer rule: intact skin body, underwear as its own meshes, outfits as separate objects on one
     armature, clipping by visibility-driven Mask modifiers. Never deleted faces. Clothes are
     built as garments (cloth sim where a garment hangs free, shrinkwrap + solidify where it fits,
     weights from the body, skin under opaque cloth masked per outfit), not painted on the body; a
     painted piece that already passes the gate may stay (yskills, 2026-10-11).
   - Adult rule: every figure is an adult woman (18+, age stated) with her grown-up look
   - Content line: lingerie very hot design, a smooth nude base thats high quality.
   - You can use paid assets. Dont use money try get it without. A free download that
     needs a login is registered with the email yskills provides;
   - Poses and motion natural: clips from the library (Quaternius UAL, VRMA), spring bones settled,
     feet on the floor, arms outside the body.
4. **Fixed checks, then the gate.** The builder renders every outfit under the office lights and
   runs the fixed scripts (`check_layers.py` prints ok). The gate looks for washed-out fabric,
   white blotches, clipping, wrong colours, hems that gap or tear; the builder does not grade its
   own render ([`TEAMS.md`](TEAMS.md), Who checks).
   - Eyes are checked in the exported game file as the game renders it (three-vrm), not only in
     Blender: the iris has its own colour and clear contrast against the eye white. A colour boost
     made in Blender that never reaches the export does not count (Hinata, 2026-10-08: a near-white
     iris texture plus a big highlight vanished in the game).
   - Renders sit on a mid-tone background, never white, so pale skin and light clothes stay readable.
   - The same spot fails a second gate round: stop patching (the `attempt-guard` hook enforces this for repeated failing commands). Write a short diagnosis first (an ID
     pass or a per-mesh isolate that names the mesh, vertices and pixel coordinates that cause it),
     then fix. Prove each fix with a pixel diff of that crop before pushing; a diff that moves
     almost nothing means the change did not reach the file the viewer loads (Hinata blouse,
     2026-10-11: four rounds of shell patches, gate v9 diff 141 px). Hand off to a fresh thread
     with a definite handoff file when the diagnosis shows a pipeline change.
   - A scene (bed, cloth, pose) is simulated in Blender, baked, and passes machine checks (body
     overlap with bedding, contact of resting parts, joint limits, popping between frames) before
     any shot exists; nothing is eyeballed by numbers (`gate.md`, Asset PRs).
5. **Show yskills one way only: the comparison sheet.**
   - Reference picture beside the render, a face close-up, each outfit, the chibi.
   - Files `figure-shots/<slug>-v<n>-sheet-1440.png`, `-sheet-390.png`, `-face.png`, at 1440 and
     390 px.
   - Posted in the project chat with the character and version named ("Hinata v2").
   - Never a bare render, never a model file, never the sheet without the reference.
6. **Gate.** A fresh Tester (figure and scene PRs are size L) runs `gate.md` on the figure's PR with fresh subagents. Extra
   criterion: likeness to the reference (a reviewer who gets only the sheet and the reference
   picture says yes or no on face, hair, body and outfits). Merge at 5/5; builders never merge.
7. **After the merge.**
   - The game exports go to the artifact's asset store; the `cards/<id>` row points at the new
     asset ids ([`docs/hq-rows.md`](hq-rows.md), Figures (cards)).
   - New reusable parts (a garment, a hair, a clip, a tool) get a library entry
     (`library.json` via `make_library.py`), so the next figure starts from them.
   - Republish HQ per company-xy `README.md` (Publish) and post the live shots.

## What a figure brief always says

The reference file, the diagnosis list, the order (head and hair, body, outfits, chibi, exports),
the deliverables of step 5, and a pointer to this page.

## Context budget (2026-10-08)

Why figure threads fill up after about 35 minutes of Blender work (they compact, a handoff only at a trigger: `docs/WORKFLOW.md`). Facts: a thread
(model per [`docs/TEAMS.md`](TEAMS.md), Models line) has a 1M-token window, the largest there is; the effort level does not
change it. More tokens for one thread cannot be bought, so the spending is what goes down. (The
three consumers below are read off the handoffs of Hinata, Rangiku, Mitsuri, Rias and Mira in the
game; the sessions' own token logs are not visible from the project.)

**The three biggest consumers**

1. **Builds run in the thread.** `build.sh` (8-9 min), `assemble.py` (8-45 min), exports and the
   three-vrm check each print long Blender logs into the thread, and the thread waits and polls.
   A rebuild after each fix repeats all of it (Mitsuri: 25 min per rebuild; Hinata: a re-assembly
   per fix).
2. **Renders opened at full size.** Every pass makes about 12 stills (3 outfits, face, chibi,
   expressions), and each was opened one by one at full resolution, again after every rebuild.
3. **The same flaws found five times.** Skin through a tight blouse, skin shards at the gown slit,
   brow streaks, a sleepy resting face: each thread rediscovered them with its own rebuild cycles
   (plus 10 min of container setup and re-reading `tools/vrm/README.md`) instead of one thread
   fixing the shared pipeline once.

**Rules** (the general version is in `briefs.md`, "Every thread brief starts with", and applies to every long thread; these are the figure details)

1. **Sub-workers do the heavy runs.** Builds, assemblies, renders and exports run in `Agent`
   sub-workers that return a short summary (ok or failed, what changed) and file paths. Their
   logs stay with them.
2. **Logs are tailed, never printed whole.** `tail -n 30` of a log file, `grep` for errors; a
   long run goes to the background with output to a file.
3. **The comparison sheet goes to the gate, reduced.** One sheet (reference beside render) at
   most 1000 px wide per check; full-size stills only to chase one named flaw, one at a time.
4. **Save and write down at every milestone.** Built files (`.blend`, `build/`, exports, renders)
   go to `/mnt/project-files/companyxy/patches/<slug>/`; `characters/<slug>/HANDOFF.md` (setup
   line, branch, PR, state, open flaws, next command) is updated at each milestone, not at the
   end. A thread that fills up hands off to "<figure> figure 2" on the same branch and PR and
   loses nothing.
5. **One figure per thread, shared flaws once.** A flaw in `tools/vrm` is fixed by the pipeline
   owner's thread; the other threads merge it in and meanwhile keep their own branch clean.

**Where practice differed from the written rules**

- Builds, logs and stills ran inside the figure thread; nothing above said otherwise, and
  `tools/vrm/README.md` gives commands only.
- The HANDOFF.md was written when the context was already full (Hinata, Rangiku, Mitsuri, Rias),
  not at milestones; Mira in the game wrote it at hand-off and lost its shot harness with the
  container.
- Each figure rebuilt the shared flaws on its own branch. The rule from now on is rule 5.

## Reference tips (from watched videos, 2026-11-08)

- Character body from scratch (not the base): subdivision-surface workflow, no sculpt and retopo. Mirror + Subsurf (clipping on, merge off), half cube, 3 loop cuts per axis, extrude limbs in 4 quads, apply the mirror before uniform X scaling.
- Cartoony smoke VFX: a metaball as the particle render object (Render tab, Object), gravity off, normal velocity ~15, damping, a blend texture with a color ramp on size so puffs shrink away.
