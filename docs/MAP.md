# Map: where everything lives and what it owes

One page to find any part of this setup. Each rule has **one home**; every other file links to
that home instead of restating it. When two files disagree, the home wins and the other gets
fixed.

## What loads when

| Loads | What | Cost (tokens, est.) |
|---|---|---|
| Every session | `CLAUDE.md`, `.claude/rules/ecc/common/*`, one line per skill and agent | ~6k |
| When a matching file is opened | `.claude/rules/ecc/{typescript,vue,nuxt,web}/*` (`paths:` frontmatter) | up to ~9k |
| When a skill is used | its `SKILL.md`, then the files it links | 0.5k to 6k per skill |
| When an agent is started | its `.claude/agents/<name>.md`, in its own context | 1k to 2k |
| Only when a file says to read it | `docs/*`, operator `roles/`, `gate.md`, `briefs.md`, templates | 0 until read |

A project thread's own base (system prompt, tools, project instructions, memory) is ~110k and
lives outside this repo.

## Parts

| Part | Path | Owes |
|---|---|---|
| Working rules | `CLAUDE.md` | The world (org, accounts, secrets, the one deploy path), how Claude works for yskills (ask rule, co-founder, auto-run), code, UI, stack. Short; detail lives in the homes below |
| Front door | `README.md` | Install, what you get, cloud setup, how to change the repo |
| This map | `docs/MAP.md` | Where things live, one home per rule |
| Run a project | `.claude/skills/operator/` | `SKILL.md` size, roles, files, setup loop, cost; `run.md` the nine steps (Project Manager only); `gate.md` the 5/5 gate and the one merge policy; `briefs.md` the three briefs, key cards and the block every thread brief starts with; `roles/<role>.md` one playbook per role; `templates/` files copied into a project (`loop/` the feedback inbox, `mailbox/` Claude's own e-mail inbox Worker) |
| Roadmap for yskills | `docs/WORKFLOW.md` | The phases in plain words, the models table, learning and memory check |
| Other own skills | `.claude/skills/<name>/` | `legal`, `sell`, `market`, `store`, `store-publish`, `publish`, `scaffold`, `onboard-project`, `ship-check`, `ui-review`, `toolbox`, `game-3d`, `roblox`, `studio`, `watch`, `media-editing`, `video-studio`, `social-team` |
| Vendored skills, agents, rules | `.claude/skills`, `.claude/agents`, `.claude/rules/ecc` | ECC subset (`config/ecc.json`, refreshed by `scripts/sync-ecc.mjs`), impeccable, web-interface-guidelines, ponytail, claude-video (`THIRD_PARTY.md`); never hand-edited |
| Own agents | `.claude/agents/` | `design-critic`, `evaluator`, `legal-reviewer`, `red-team` |
| PC install | `install.mjs`, `global/`, `config/plugins.json`, `mods/team` | Copies this repo into `~/.claude`, settings, status line, context guard, plugins, the team mod |
| Claude's PC user | `docs/pc-claude-user.md` | What differs on the `Claude` Windows user (portable Git, env var, paths) and what still needs hands |
| Cloud threads | `cloud/setup.sh` | Plugins and the context guard in a cloud environment (paste into Project settings) |
| HQ rows | `docs/hq-rows.md` | What each Project Manager writes into HQ (the page itself lives in yverse-studio/company-xy) |
| Characters | `docs/character-workflow.md` | The one way to make a 3D character and show it to yskills: reference, build, self-check, comparison sheet, gate, library |
| Using it (for yskills) | `docs/USING.md` | One phone page: how to start an app, deploy or delete a page in one shot, what you see, what it costs |
| Project registry | `projects/` | One `<name>.json` per project the `new-project` workflow made; `delete-project` needs it |
| After launch | `docs/LOOP.md` | Errors and feedback become issues and fix threads |
| Setup loop | operator `SKILL.md` (Setup loop) | Friction with this repo becomes a `loop:setup` issue, then a fix thread through the gate |
| Test runs | `docs/TEST-PROJECTS.md` | How the setup is tested end to end, and what each run taught |
| Why it is built this way | `docs/RESEARCH.md`, `docs/research/` | Dated research notes; history, not rules |
| Lessons per project | `docs/LESSONS-2026-10-11.md` | Company XY: liked, not liked, quality problems with the fix in force, the next game |
| Checks | `scripts/check.mjs`, `scripts/guards.test.mjs`, `.github/workflows/ci.yml` | Frontmatter, names, models, ECC subset, plugin lists, relative links; own skill descriptions (200 characters, a "Use ..." sentence), `maxTurns` on own agents, no hooks in settings files; the deny rules, hook hygiene and the never/always tags |

## Expertise by domain

What Claude already knows, fetched only when a job needs it. A skill named here lives at
`.claude/skills/<name>/SKILL.md` in claude-setup: when it is not in your skill list (claude-setup
added as a second repo, or a plain chat), read that file by path, then the files it links.

| Domain | Read first | Then, when needed |
|---|---|---|
| Web app, stack, deploy | `scaffold`, `publish`; `docs/USING.md` (deploy or delete a page) | `nuxt4-patterns`, `vue-patterns`, `vite-patterns`, `api-design`, `database-migrations`, `e2e-testing` |
| Running a project | `operator` (roles, gate, briefs) | `operator/roles/<role>.md` |
| Payments, Stripe, shop | `sell` (Checkout, subscriptions, Stripe on Workers, shop law, go-live) | `sell/stripe-workers.md`, `keys.md`, `legal-de.md`, `physical.md`; `toolbox/catalog/money.md` (ads, in-app, VAT) |
| App stores | `store` (Capacitor, RevenueCat, TestFlight, review) | `toolbox/catalog/app-platform.md` |
| Game as APK and on Google Play (workflow, Learnings) | `store-publish` | `publish` (the website), `game-3d` (Steam later) |
| German law, DSGVO | `legal` | `legal-reviewer` agent; `sell/legal-de.md` for shops |
| Security | `security-review` | `security-reviewer`, `red-team` agents |
| Design, UI/UX | `CLAUDE.md` (UI), the project's `DESIGN.md` | `impeccable`, `make-interfaces-feel-better`, `web-interface-guidelines`, `design-system`, `ui-review`, `design-critic` agent |
| 3D games, Steam | `game-3d` (three.js + Electron, decided 2026-10-07) | `game-3d/refs/` (camera, game feel, levels, glTF, lighting, perf, Steam) |
| 2D and web games | `toolbox/catalog/data-web.md` (Phaser, PixiJS, Poki, CrazyGames) | `toolbox/catalog/money.md` (H5 game ads) |
| Roblox | `roblox` | `toolbox/catalog/roblox.md` (run and see), `studio` (PC) |
| 3D models, characters | `docs/character-workflow.md` | `game-3d` (VRM pipeline), `studio` (Blender on the PC) |
| Videos and ads (the studio: Producer, Writer, Director, Editor, Motion, Critic) | `video-studio` | `video-studio/learnings.md`, `market` §4 (ads law) |
| Social media: posting, comments, DMs, idea backlog, brand accounts, brand deals | `social-team` | `social-team/learnings.md`, `market` §4 and §6 |
| Video and photo edits | `media-editing` | `watch` (understand a video), `toolbox/catalog/video-audio.md` (AI video, voice, music) |
| AI features, local models | `toolbox/catalog/ai.md` | the built-in `claude-api` skill; `docs/research/2026-10-07-own-local-model.md` |
| Marketing, SEO | `market` | `seo`, `market-research`, `product-lens`, `toolbox/catalog/growth.md` |
| Anything else | `toolbox` (pick a plugin, MCP, API or library) | `search-first` |

Unity and Unreal are not used (they need the editor on the PC for every look); Godot only for consoles.

## One home per rule

| Rule | Home | Others only link |
|---|---|---|
| Org, accounts, where secrets live | `CLAUDE.md` (The world) | `publish` skill, `docs/WORKFLOW.md` (PC work) |
| Deploy or delete a page (the steps) | `docs/USING.md` | operator `run.md`, `briefs.md`; detail in `publish` |
| Ask rule (what needs yskills) | `CLAUDE.md` (How to work) | operator `SKILL.md`, `docs/USING.md` |
| Auto-run, pauses and taste calls | `CLAUDE.md` (How to work) | operator `SKILL.md`, `docs/WORKFLOW.md` |
| Cards and votes (who posts them, the thread-to-coordinator loop, a live vote gallery per visual choice); yskills reads only the project chat | `CLAUDE.md` (How to work) | `briefs.md` (b), `roles/project-manager.md` |
| Co-founder | `CLAUDE.md` (How to work) | `roles/*.md` (one role-specific line each) |
| Literal mode and cost | the brief block in `briefs.md` | `roles/*.md` (one pointer each) |
| Merge policy, 5/5 gate | `gate.md` (Merge policy) | `CLAUDE.md`, `docs/WORKFLOW.md`, `roles/tester.md` |
| Models | the one line in `docs/WORKFLOW.md` (Models) | everything else links it; CI fails on a model id outside that line |
| Context guard numbers (warn 150k, hand off 200k) | `global/context-guard.mjs` | `CLAUDE.md`, `README.md` |
| Remote Control on the PC | `docs/WORKFLOW.md` (PC work) | operator `SKILL.md` |
| UI rules | `CLAUDE.md` (UI) | `roles/designer.md`, `ui-review` (screenshots, the load-once check, run videos via `desktop.sh`) |
| Character workflow (reference, sheet, likeness gate) | `docs/character-workflow.md` | `roles/programmer.md`, `roles/tester.md`, `roles/designer.md`, `briefs.md` |
| Deploys, the workflows' detail, the two Cloudflare routes, deploy lessons | `publish` skill | `CLAUDE.md`, `docs/USING.md` |
| Money and shop law | `sell` skill | `docs/WORKFLOW.md` (Selling) |
| Project instructions text (a pointer to this repo) | `operator/templates/project-instructions.md` | the live text in each project's settings |
| An idea or change for a live project | operator `SKILL.md` (Idea for a live project) | `CLAUDE.md`, `roles/project-manager.md` |
| How a video or ad is made (roles, pipeline, video lessons) | `video-studio` skill | operator `SKILL.md`, `roles/marketer.md`, `market` |
| How posts go out, auto-post guardrails, comments and DMs, brand accounts | `social-team` skill | operator `SKILL.md`, `video-studio`, `market` §6, `docs/USING.md` |

## Keeping it clean

- A new rule goes into its home and nowhere else; add a row above if it has no home yet.
- A dated quote from yskills goes into the home once; other files point to it.
- `node scripts/check.mjs` fails on a dead relative link.
- A "never" or "always" bullet in `CLAUDE.md`, operator or publish `SKILL.md` ends in `[advisory]` (prose only) or `[guard: deny|ask <rule in global/settings.json>]`, `[guard: test|hook <file>]`. Prefer a guard; the lint fails on an untagged one.
- Research and test-run notes are history: never cite them as the rule.
