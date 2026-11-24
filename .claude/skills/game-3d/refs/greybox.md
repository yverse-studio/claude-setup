# Greybox before art: the level stage (research 2026-11-24)

From the vacation-game research `research/greybox/research.md` (project files, every link there). A level is proved
in plain boxes before any art is spent; the method is the vendored
[`gamedev-skills/level-design`](gamedev-skills/level-design/SKILL.md) (blockout, metrics, beats, review checklist),
this page says when it runs and what passes it. Tags: **V** primary source read, **C** summary of a paywalled talk,
**U** our choice.

## Why

- Studios block out at true scale, test it with players, then dress (Level Design Book "Blockout"; Naughty Dog
  blockmesh, GDC 2018 Shaver/Yang; Bethesda iterative LD, GDC 2014 Burgess: the early structural passes give the
  biggest gain) (C).
- Real places are measured, then compressed on purpose (AC Unity's Paris: centre near 1:1, larger scale toward the
  edge; Spider-Man's Manhattan about a quarter of the real area) (C).
- vacation-game 2026-11-17 to 11-24: the 3D market's look was gated five rounds on hero pieces while the street could
  not be walked; the airport, played on boxes first (PR #9), only moved its picture in later look passes (U).

## The stage (between the level plan and the art build)

1. **Import:** the real layout from map data (OSM) or the level plan, as one `blocks` list (position, size, height,
   kind) that collision and art both read.
2. **Metrics card** in the level doc: player numbers by GDD key (speed, eye, radius, pitch, fov), the run band in
   seconds, played metres = band × speed, the compression (what is cut and why), lane and door widths that must hold.
3. **Grey mode:** the chapter runs with `?look=grey`: every block as an untextured box at true size, one colour code
   (walkable light grey with a 1 m grid, blocked mid grey, interactive orange, goal yellow, spawn green), flat light;
   rules, rng, collision and NPC logic unchanged. Built once per game, reused by every level.
4. **Beat map:** the critical path as `beat · where · what · intensity 0..1`, a sawtooth with a rest before each spike.
5. **Greybox gate** (fresh Reviewer): bot walk on 20 seeds inside the band with no stuck point; clearances
   ≥ player radius; the next target visible from spawn and each beat; three blind plays in grey, at most one player
   lost over 20 s; top-down plot of the bot paths. No look criteria at this gate.
6. **Art pass** in the chosen look only on a greybox PASS; each art module keeps its box's footprint (± 5 cm, a check
   in the art PR). A PR that moves, adds or removes a block re-runs step 5 in grey.

## Skip

Hand-built editor blockouts (boxes are generated from the layout), separate level and world teams, fps targets in
grey (software GL in the cloud).
