# cxy · one front door for a project's pipeline scripts

For projects where threads leave hundreds of job scripts behind (Blender pipelines: one copy of a tool per round, lane
or character). Plain Python 3, no dependencies. Live install: GameDev project-files `_cloud_blender/cxy/` (2026-11-10,
563 scripts inventoried, 22 dead copies archived).

Install in a project: copy this folder next to the project's tools, rename `registry.example.json` to `registry.json`
and `archive_rules.example.json` to `archive_rules.json`, set `CXY_ROOT` if the project root is not two folders up.

| Command | What |
|---|---|
| `python3 cxy.py list` | every tool command, its pipeline step, runner, script |
| `python3 cxy.py doctor` | registered scripts exist, Blender / bpy python found |
| `python3 cxy.py inventory` | every script under the root: canonical, helper, used, fork, one-off, duplicate, dead (+ why it is protected) → `INVENTORY.md` |
| `python3 cxy.py archive [--apply]` | dry run writes `ARCHIVE-PLAN.json` + the move list to review; `--apply` moves exactly that reviewed list (refused if rewritten since) to `_archive/<date>-scripts/` with `MANIFEST.tsv`; never deletes or overwrites |
| `python3 cxy.py archive --undo <MANIFEST.tsv>` | everything back |
| `python3 cxy.py <tool> [--cxy-dry] [--cxy-factory] args` | runs the registered script with its runner (python3, bpy python, Blender batch, node) |

Output of every command: `OK`, `WARN`, `RED` lines and one `RESULT PASS` / `RESULT RED` line; exit 0 / 1.

What `archive` may move: only `dead` scripts (old round folders, `_withdrawn/`, `archive/` copies nobody names) and duplicates inside such folders.

Rules it keeps: tools are never edited or moved (old paths keep working for running threads); `archive` never moves
canonical tools or their folders, files changed in the last `recent_hours`, `protected_areas`, `freeze/` packages,
anything a proven doc names, a duplicate a staying sibling imports, a duplicate outside a round or archived folder (listed only), or a file that changed since the inventory.
Merging two forks of a proven tool is a job for the thread that owns it (compare one result old vs new first).

Tests: `python3 -m unittest discover -s tests` (sample tree in a temp dir).
