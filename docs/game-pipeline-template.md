# Game and asset pipeline template (copy it for a new game)

The generic skeleton for any render-based game: one shared asset library, one source of truth per
game, gates between steps, expensive models plan and gate, cheap models build. Copy the layout,
fill the blanks (`<game>`, `<prefix>`), keep the rules. Where files of the existing story game
live: [`game-pipeline.md`](game-pipeline.md). This page holds no tool-specific numbers; those stay
in the detail docs it links.

## 1 · One source of truth

- Each game has **one** `PIPELINE.md`: the order of steps, **one tool per step**, who does it
  (model), what "done" means, and the gate bar. Every brief names it first.
- Detail docs (rig steps, clothes lessons, room workflow) carry numbers and lessons, never a second
  set of rules. Each starts with a banner: `Detail for PIPELINE.md §n; if they differ, PIPELINE.md wins.`
- A path checker (`pipeline_check.py`) lists every script `PIPELINE.md` names and fails if one is
  missing. It prints `PIPELINE CHECK OK` or the missing names. Tools not built yet are listed in a
  "Not built yet" line so nobody invents a second one.
- Order of work: **models, clothes, rooms/scenes, animation and cameras, render, chapter build.**

## 2 · Shared library

One library serves every game (`StudioLibrary/`, outside git). A game never owns its own copy of a
figure, garment or room.

```
StudioLibrary/
  lib/characters/   CH_<name>/ (recipe + built file + STATUS.md)
  lib/clothes/      CL_<item>/fitted/<base>.blend (+ README, sorted index)
  lib/rooms/        <room>/ (build script is the source, .blend is output)
  lib/anims/        clips, retarget maps
  tools/            the one script per step
  docs/WORKFLOW.md  path map only; rules live in PIPELINE.md
```

- **Every asset has a `STATUS.md`:** state (draft, gated, approved), the live file's sha256, next step.
- **A new game reuses the library and prefixes its own assets** (`<prefix>_...`); it never renames
  or edits shared ones.
- **Approved assets are never edited in place.** A game copies one, versions the copy
  (`<name>_<date>_<reason>`), and writes the result back only through the clean-end steps in §6.
  One target, one working copy, one archive state: no `_v1` to `_v23` chains.
- Downloads land in an inbox folder first; keep what is needed, record the licence, sort it in.

## 3 · Gates and models

| Who | Model tier | Does |
|---|---|---|
| Planner / Architect | expensive | plans, writes exact fix lists (what, where, value, file), compares against the reference first |
| Gate (one fixed thread per asset, reused) | expensive, never the builder | scores, posts `GATE.md` with **marked image links** |
| Builder | cheap; heavy 3D (weights, topology, shape-key solving) the expensive tier | edits exactly the plan, renders previews only, never scores itself |
| Reader / lists / index refresh | cheapest | no builds |

- **Bar: 4.8/5** for asset gates in this template, plus every hard check green. Below the bar the
  gate lists exact fixes and the same gate runs again. The score mechanics (rounds, best eligible
  version, judge noise) have one home: [`gate.md`](../.claude/skills/operator/gate.md), Scored gates.
- Gate results are always posted with marked image links, text and labels on images large enough to
  read on a phone.
- Loop that worked (five rounds): architect plan, builder previews only (low percentage, few
  samples) with the reference beside them, gate scores and lists changes, repeat. A shot at the bar
  gets its final render at once.
- Cheapest check first: numbers, then proxy, then crop, then strip, only then light, room and final.
  Two rounds without a better number: stop and hand the numbers to the planner.
- Before a full render the thread posts a low-resolution check strip to the gate; no waiting.

## 4 · One Blender lane

One machine runs one Blender job at a time. A job claims the lane by writing its name into
`_queue/WHO.md`, checks running `blender` processes and free RAM (about 4 GB) first, and clears the
line when it ends. Light work (pose proxies, stills, clothes, rooms) runs in the cloud instead.

## 5 · Brief stamp

Every thread brief starts with the stamp (format and the rest of the brief: [`docs/TEAMS.md`](TEAMS.md)):

```
Role: · Kit: · Size:
Prior art:   what exists, what it is reused from
Model:       the tier, per the table in §3
Skills:      the skills the thread loads
Done when:   checkable, including the clean end of §6
Stop when:   the condition that ends the job early
Start:       the first command or file
```

## 6 · Clean end (put it in every brief)

A job is done only when all of this is true:

1. The **right model and base** were used (the live file's sha was checked first; a wrong hash means stop).
2. **Final changes are written back into the live file**, cloud builds included: ship data, script
   and an `APPLY.md`; the laptop `apply` checks the hash before and after. Never ship a `.blend`
   over a live file that moved.
3. The asset sits **in the right library place**, nothing left as a work file.
4. **Backup is the full live file plus its sha256**, taken once before the change.
5. Approved body or look values are **unchanged** after a rig or rebuild.
6. `STATUS.md` overwritten (state and next step), one line in `HISTORY.md` per round, `GATE.md`
   linked with its marked images.
7. One active file per job: one preview per camera, overwritten; one reused gate thread.

## 7 · Lessons (each one cost a round)

- **Don't invent.** Search for prior art first, buy, copy a CC0 asset or reverse-engineer a tool;
  self-build only a short named list (the fit gate, the assembler, thin glue).
- **Approved looks win.** A rebuild or rig pass never changes approved key values; put the values
  in one specs file and diff against it.
- **Always extract fresh.** Never reuse a stale delta, cache or intermediate file; re-extract from
  the live file and compare hashes.
- **A backup is the full live file plus its sha**, not a delta.
- **Take references seriously.** Preview next to the reference every round; no own reinterpretation.
- **Reuse threads.** One gate thread and one fixer per asset; start a new thread only when the work
  really splits.
- "JOB OK" from a render farm means nothing; check that new frames exist and are newer than the job start.
- Adult-only content never goes into any repo, even private ones: see the rule in
  [`game-pipeline.md`](game-pipeline.md), One source, kept clean.

## 8 · Start a new game from this page

1. Copy §1-§6 into the game's `PIPELINE.md`, fill the tool table (step, one tool, detail doc, done when).
2. Create the game's prefix and `STATUS.md` files; point the game at the shared `lib/`.
3. Write the path checker for the tools you named; run it in CI of the game repo.
4. Brief the first thread with the stamp of §5.

Related homes: [`clothing-pipeline.md`](clothing-pipeline.md) (garments per base),
[`character-creator.md`](character-creator.md) (recipes), [`base-delta.md`](base-delta.md) (rebuilds),
[`two-figure-scenes.md`](two-figure-scenes.md) (scenes), [`game-in-an-hour.md`](game-in-an-hour.md) (story game playbook).
