# Third-party content

## Everything Claude Code

Source: https://github.com/affaan-m/ECC (MIT, see licenses/ECC-LICENSE)
Version: 2.2.3
Commit: c05b2d6614f62f6db0047669aa4eefb223d478f9

Copied by scripts/sync-ecc.mjs from the list in config/ecc.json. Do not edit these by hand;
change config/ecc.json and re-run the script.

- skills/search-first
- skills/strategic-compact
- skills/security-review
- skills/context-budget
- skills/product-lens
- skills/market-research
- skills/vue-patterns
- skills/nuxt4-patterns
- skills/vite-patterns
- skills/api-design
- skills/database-migrations
- skills/e2e-testing
- skills/make-interfaces-feel-better
- skills/design-system
- skills/i18n-sync
- skills/seo
- skills/docker-patterns
- agents/planner
- agents/architect
- agents/code-reviewer
- agents/typescript-reviewer
- agents/vue-reviewer
- agents/security-reviewer
- agents/database-reviewer
- agents/build-error-resolver
- agents/e2e-runner
- agents/refactor-cleaner
- agents/silent-failure-hunter
- agents/doc-updater
- agents/a11y-architect
- agents/performance-optimizer
- agents/seo-specialist
- rules/ecc (common, typescript, vue, nuxt, web)

## Ponytail

Source: https://github.com/DietrichGebert/ponytail (MIT, see .claude/skills/ponytail/LICENSE)
Version: 4.10.3
Commit: c982cd411abb53323c4baa1baa3c2f020b8d0b08

Only the core skill is copied, unchanged: .claude/skills/ponytail/SKILL.md. Its hooks (which
re-inject the skill on every session start and subagent) and its five extra skills are left
out. Read in full before adding; it runs nothing and makes no network calls.

## Impeccable

Source: https://github.com/pbakaus/impeccable (Apache-2.0, see licenses/IMPECCABLE-LICENSE)
Version: skill 4.5.0
Commit: 6e802bd

Copied unchanged into .claude/skills/impeccable. Read before adding: the skill is instructions
plus reference files; `scripts/impeccable detect` downloads the engine binary from the project's
GitHub releases and checks its sha256 before running it. It sends no code anywhere.

## Vercel Web Interface Guidelines

Source: https://github.com/vercel-labs/web-interface-guidelines (MIT, see
licenses/WEB-INTERFACE-GUIDELINES-LICENSE)
Commit: e3d624b

The guideline text is pinned in .claude/skills/web-interface-guidelines/SKILL.md instead of
fetched live, so a review never needs a web read.

## claude-video (watch)

Source: https://github.com/bradautomates/claude-video (MIT, see licenses/CLAUDE-VIDEO-LICENSE)
Version: 0.3.2
Commit: 03ceb42

Copied into .claude/skills/watch: SKILL.md and scripts/, minus the packaging script
build-skill.sh. The plugin's SessionStart hook (a setup check) is left out. Two local changes,
from a security review: keys are never read from the current project's `.env`
(`scripts/config.py`), and yt-dlp runs from a fresh private directory so a repo's `yt-dlp.conf` can't
add options (`scripts/download.py`). Read in full before
adding: standard-library Python that runs yt-dlp and ffmpeg. It talks only to the video site,
and to Gemini, Groq or OpenAI when a key for one is set in the environment or
~/.config/watch/.env. Optional WhisperX setup downloads uv and
PyTorch.

## Kenney Furniture Kit

Source: https://kenney.nl/assets/furniture-kit (CC0 1.0, no attribution required)

The pieces HQ's desk room uses are packed into `office-kit.js` in yverse-studio/company-xy by its
`scripts/office-kit.mjs`. Do not edit the packed file; change the script's list and re-run it.

## Floor guard

Source: https://github.com/addyosmani/agent-skills (MIT, see licenses/AGENT-SKILLS-LICENSE),
`skills/constraint-driven-development/references/floor-guard.md`. Adapted (diff plumbing and exit
codes kept; the CONSTRAINTS.md checks dropped; test, threshold and `floor-ok` rules added) as
`.claude/skills/publish/templates/new-project/scripts/floor-guard.mjs`. Read, not run, before copying.

## Game-dev skill references (game-3d)

Read in full before copying (2026-10-07, thread "Researcher: 3D game path"): plain SKILL.md and
reference text, no hooks or MCP config, nothing that phones home.

- https://github.com/gamedev-skills/awesome-gamedev-agent-skills (Apache-2.0, LICENSE and
  NOTICE kept next to the copies), commit d4b0e35: `skills/web-engines/threejs-scene-setup`,
  `threejs-gltf-loading`, `threejs-materials-lighting`, `skills/disciplines/game-feel`,
  `level-design`, `audio-design`, `performance-optimization`, `camera-systems`,
  `skills/workflows/steam-publish`, copied into `.claude/skills/game-3d/refs/gamedev-skills/`.
- https://github.com/majidmanzarpour/threejs-game-skills (MIT), commit 8286774:
  `skills/threejs-gameplay-systems` (with its Vite + TypeScript scaffold, a local copy script and
  no npm postinstall), `threejs-aaa-graphics-builder`, `threejs-qa-release`, copied into
  `.claude/skills/game-3d/refs/threejs-game-skills/`. Left out on purpose: the `-generator`
  skills (Tripo, Gemini, ElevenLabs paid APIs), the `game-director` skill and its credential
  probe script (it sources shell rc files), and `AGENTS.md`.
