# 3D and game starter kit

Read this folder once, at the start of a project, when yskills says 3D, game, figure, avatar or
chibi. It is what Company XY learned building Mira (2026-10-07/08), cut down to what a new
project needs. Then follow `../SKILL.md` for engine, layout, tests and Steam.

| File | Read it for |
|---|---|
| [chibi-roadmap.md](chibi-roadmap.md) | the office/game chibi, step by step with a check per step |
| [figures.md](figures.md) | the full-size figure pipeline (layers, faces, physics, dance, look) and its quality bar |
| [models.md](models.md) | every standard model and asset pack: licence, path, ship or study only |
| [learnings.md](learnings.md) | the decisions, settings and pitfalls worth keeping; the noise is dropped |
| [walkable-room.md](walkable-room.md) | camera, controller, collision and light numbers for a third-person cozy room, and its kit modules |

## Where the real files live

| What | Where |
|---|---|
| Pipeline scripts and their README | `yverse-studio/company-xy` → `tools/vrm/` ([README](https://github.com/yverse-studio/company-xy/blob/main/tools/vrm/README.md), [chibi notes](https://github.com/yverse-studio/company-xy/blob/main/tools/vrm/chibi-notes.md)) |
| Mira's build, state and open flaws | `yverse-studio/company-xy` → `characters/mira/HANDOFF.md` |
| Asset library (635 MB, outside git) | CompanyXY project share `/mnt/project-files/companyxy/vrm-library/`, indexed by `tools/vrm/library.json` |
| Research originals | CompanyXY project share `/mnt/project-files/companyxy/research/` (only for detail; [learnings.md](learnings.md) has the conclusions) |

Until company-xy PR 12 merges, `tools/vrm/` and `characters/mira/` exist only on its branch
`slice/mira-7ltb6b`; read them there.

**In another project** the share is not mounted. Clone `yverse-studio/company-xy` next to the new repo
and run `tools/vrm/fetch-library.sh <root>` (pinned URLs, sha256-checked; `ONLY=<folder>` for one
source). The Koban chibi base is a manual Gumroad download: ask yskills for the zip once, or copy
it from the CompanyXY share. Copy only the assets the game ships into its `assets/`, each with a
manifest row (`../SKILL.md` §3).

## Example shots (what good and bad looked like)

| Shot | Shows |
|---|---|
| `characters/mira/laptop/shots/chibi-turnaround.png`, `chibi-face-sheet.png` (company-xy git) | the Koban-based chibi turnaround and faces sheet |
| share `mira-shots/mira-v11-chibi-compare.png` | base vs chubbier ("Mollig") side by side, the way yskills picks |
| share `mira-shots/mira-v11-chibi-faces.png` | the chibi expression set |
| share `mira-shots/mira-v12-dance-frames.png`, `mira-v12-handles.png` | the dance loop and the IK drag handles |
| share `mira-shots/library-sheet.png` | contact sheet of the free library |
| share `research/free-model-study/strap-cut-vs-straight.png` | why straps are cut from the body (right) and not modelled as ribbons (left) |
| share `mira-shots/mira-v4-chibi.png`, `mira-v7-chibi.png` | rejected: chibi made by scaling a full figure's bones |

Share paths are under `/mnt/project-files/companyxy/`.

## Start order for a new 3D project

1. Read this folder, then `../SKILL.md` §1b: references first, brief second.
2. Pick bases from [models.md](models.md) with a licence that fits the game (paid game: only rows
   marked "ship").
3. Build figures with the `tools/vrm/` scripts ([figures.md](figures.md)); chibis per
   [chibi-roadmap.md](chibi-roadmap.md). Never start a body from scratch.
4. Check every figure against the quality bar in [figures.md](figures.md) before anyone sees it.
5. Add what the project taught to [learnings.md](learnings.md) (one line, only if it recurs).

## Licence rule

- Standard models are our own builds plus CC0 and CC-BY library assets, credited per
  [models.md](models.md). A personal or non-commercial licence never ships in a paid game
  (`scripts/check-assets.mjs` fails on it).
- The Shadowheart file in company-xy's local `assets/` is a CC-BY-NC-ND game rip: **study only**.
  Never reworked, pushed or shipped. No amount of rework makes a rip ours; the techniques we took
  from it are already in [figures.md](figures.md).
- Paid models (none yet) live in the artifact's or game's private asset store, never in git.
