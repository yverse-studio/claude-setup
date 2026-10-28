# Agents other than Claude Code (OpenCode, Luna 2)

The rules are in `CLAUDE.md`; this file only points to them. Read in this order:

1. `CLAUDE.md`, then `docs/MAP.md` (Start here) and `docs/TEAMS.md`.
2. `docs/luna2.md` (what Luna 2 is and cannot do) and `docs/luna2-handoff.md` (current state).

Where things go: a product's state and lessons go into that product's own repo (`PROGRESS.md`, `docs/LESSONS.md`),
through a PR in that repo. Only lessons that hold for every project go to claude-setup. The Ren'Py game
(`yverse-studio/companyxy-spiel`) uses the `story` kit (`docs/TEAMS.md`); its pipeline is `docs/game-pipeline.md`.
"GitHub aktualisieren" for a game means its own repo, not claude-setup.

Blender: the rules for any Blender script are `.claude/skills/studio/blender-recipes.md` (arrives with PR 355; read it
before writing or running one) and `scripts/blender/bpy-lint.mjs`. No Blender MCP is installed; if one is ever added it
must be the official Blender Lab connector, never `ahujasid/blender-mcp` (opt-in telemetry can upload screenshots).

Hooks and guards do not run here, so follow every `[guard: ...]` line by hand and let the PR gate decide.
