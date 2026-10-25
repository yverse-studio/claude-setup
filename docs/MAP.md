# Map: where everything lives and what it owes

One page to find any part of this setup. Each rule has **one home**; every other file links to
that home instead of restating it. When two files disagree, the home wins and the other gets
fixed.

## Start here

Four layers, each with one job. A fact lives in exactly one layer.

| Layer | What | Where | Who writes | Loaded |
|---|---|---|---|---|
| Rules and lessons | every rule, lesson and how-to | claude-setup, one home each, indexed here; product lessons in `<product repo>/docs/LESSONS.md` | threads, through gated PRs | every session, after `add_repo` |
| State | goal, live projects, pending on yskills, open threads, products | the project's `MEMORY.md` only, shape in `.claude/skills/operator/templates/project-memory.md` | the coordinator at milestones; threads their own line | automatically, every start |
| Boot text | how a session gets to the other layers | Project settings > Project instructions; a pointer, never a rule | yskills pastes, once | every session of that project |
| History | research, audits, handoffs, screenshots | `/mnt/project-files/<project>/` and `docs/archive/` | threads | only when a brief names it |

What every session does at start:

| Surface | Reads first | Then |
|---|---|---|
| Coordinator (project chat) | `MEMORY.md`, the thread board | `add_repo` claude-setup, `CLAUDE.md`, this section, `roles/project-manager.md` Session start; reconciles board and state |
| Thread | its brief, `MEMORY.md` | `add_repo` claude-setup, `CLAUDE.md`, this section, its role file; for a product also that repo's `CLAUDE.md` and `docs/LESSONS.md` |
| Claude Code on the laptop | `~/.claude/CLAUDE.md` | the project's `CLAUDE.md`; auto-memory is a scratchpad |
| New claude.ai project | the generated boot text | as a coordinator; its first session sweeps old memory into the repo |
| Plain chat (no project) | yskills' user preferences | this section; the `operator` skill sizes the job; no memory |

The thread board is read at every coordinator start and wins over memory.

### Where a lesson goes

1. A mechanical pattern (a banned call, a file rule, a number): a check in `scripts/` or CI, not text.
2. True for every project: the home named in One home per rule below; no home yet: add a row there.
3. True for one product only: `<product repo>/docs/LESSONS.md` (template `.claude/skills/operator/templates/lessons.md`), dated, newest last.
4. State (what is open, who owes what): the `MEMORY.md` section it belongs to.
5. Everything else (how the day went, a dead end, a report): `/mnt/project-files/<project>/`; nothing to do.

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
| Other own skills | `.claude/skills/<name>/` | `legal`, `sell`, `market`, `store`, `store-publish`, `publish`, `scaffold`, `onboard-project`, `ship-check`, `ui-review`, `toolbox`, `game-3d`, `roblox`, `studio`, `blender-body`, `storyteller`, `watch`, `media-editing`, `video-studio`, `social-team` |
| Vendored skills, agents, rules | `.claude/skills`, `.claude/agents`, `.claude/rules/ecc` | ECC subset (`config/ecc.json`, refreshed by `scripts/sync-ecc.mjs`), impeccable, web-interface-guidelines, ponytail, claude-video (`THIRD_PARTY.md`); never hand-edited |
| Own agents | `.claude/agents/` | `design-critic`, `evaluator`, `legal-reviewer`, `red-team` |
| PC install | `install.mjs`, `global/`, `config/plugins.json`, `mods/team` | Copies this repo into `~/.claude`, settings, status line, context guard, plugins, the team mod |
| Claude's PC user | `docs/pc-claude-user.md` | What differs on the `Claude` Windows user (portable Git, env var, paths) and what still needs hands |
| Cloud threads | `cloud/bootstrap.sh` (paste once), runs `cloud/setup.sh` | Plugins and the guards in a cloud environment (Project settings > Cloud environment) |
| HQ rows | `docs/hq-rows.md` | What each Project Manager writes into HQ (the page itself lives in yverse-studio/company-xy) |
| Game pipeline | `docs/game-pipeline.md` | Where every game file lives (laptop GameAssetLibrary, game folder, project files), how to put an animation on a character, build a scene, write a chapter, plus the lessons |
| Characters | `docs/character-workflow.md` | The one way to make a 3D character and show it to yskills: reference, build, self-check, comparison sheet, gate, library |
| Using it (for yskills) | `docs/USING.md` | One phone page: how to start an app, deploy or delete a page in one shot, what you see, what it costs |
| Project registry | `projects/` | One `<name>.json` per project the `new-project` workflow made; `delete-project` needs it |
| After launch | `docs/LOOP.md` | Errors and feedback become issues and fix threads |
| Setup loop | operator `SKILL.md` (Setup loop) | Friction with this repo becomes a `loop:setup` issue, then a fix thread through the gate |
| Test runs | `docs/TEST-PROJECTS.md` | How the setup is tested end to end, and what each run taught |
| Why it is built this way | `docs/RESEARCH.md`, `docs/research/` | Dated research notes; history, not rules |
| Lessons per project | `docs/LESSONS-2026-10-11.md` | Company XY: liked, not liked, quality problems with the fix in force, the next game |
| Lessons homes | [.claude/skills/game-3d/starter/learnings.md](../.claude/skills/game-3d/starter/learnings.md), [.claude/skills/operator/roles/analytics.md](../.claude/skills/operator/roles/analytics.md), [.claude/skills/operator/roles/audio.md](../.claude/skills/operator/roles/audio.md), [.claude/skills/operator/roles/content-designer.md](../.claude/skills/operator/roles/content-designer.md), [.claude/skills/operator/roles/designer.md](../.claude/skills/operator/roles/designer.md), [.claude/skills/operator/roles/game-designer.md](../.claude/skills/operator/roles/game-designer.md), [.claude/skills/operator/roles/legal.md](../.claude/skills/operator/roles/legal.md), [.claude/skills/operator/roles/marketer.md](../.claude/skills/operator/roles/marketer.md), [.claude/skills/operator/roles/playtester.md](../.claude/skills/operator/roles/playtester.md), [.claude/skills/operator/roles/programmer.md](../.claude/skills/operator/roles/programmer.md), [.claude/skills/operator/roles/project-manager.md](../.claude/skills/operator/roles/project-manager.md), [.claude/skills/operator/roles/researcher.md](../.claude/skills/operator/roles/researcher.md), [.claude/skills/operator/roles/reviewer.md](../.claude/skills/operator/roles/reviewer.md), [.claude/skills/operator/roles/security.md](../.claude/skills/operator/roles/security.md), [.claude/skills/operator/roles/tester.md](../.claude/skills/operator/roles/tester.md), [.claude/skills/social-team/learnings.md](../.claude/skills/social-team/learnings.md), [.claude/skills/store-publish/SKILL.md](../.claude/skills/store-publish/SKILL.md), [.claude/skills/video-studio/learnings.md](../.claude/skills/video-studio/learnings.md), [.claude/skills/video-studio/roles/director.md](../.claude/skills/video-studio/roles/director.md), [.claude/skills/video-studio/roles/writer.md](../.claude/skills/video-studio/roles/writer.md), [docs/game-pipeline.md](game-pipeline.md) | Every file with a `## Lessons` or `## Learnings` heading, or named `learnings.md`; `node scripts/check.mjs` fails when one is not linked here |
| State template | `.claude/skills/operator/templates/project-memory.md` | The shape of a project's `MEMORY.md`: five sections, under 3 KB |
| Product lessons template | `.claude/skills/operator/templates/lessons.md` | The `docs/LESSONS.md` of a product repo |
| Archive | `docs/archive/` | Raw copies of retired memory and reports; history only, never a rule |
| Checks | `scripts/check.mjs`, `scripts/guards.test.mjs`, `.github/workflows/ci.yml`, `.claude/skills/publish/templates/new-project/scripts/floor-guard.mjs` (+ `scripts/floor-guard.test.mjs`) | Frontmatter, names, models, ECC subset, plugin lists, relative links; own skill descriptions (200 characters, a "Use ..." sentence), `maxTurns` on own agents, no hooks in settings files; the deny rules, hook hygiene and the never/always tags; floor guard: a PR that skips or deletes a test (matched test by test, so a new unrelated test does not offset it), drops assertions, adds a suppression or stub or lowers a coverage threshold fails unless a commit says `floor-ok: <reason>` (every new project's CI runs the same script); `publish/templates/new-project/scripts/project-checks.mjs` (+ `scripts/project-checks.test.mjs`): every new project's CI also runs the design, copy, tracking-plan (and for a game game-design and sound) checks on the files a PR changes |

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
| Design, UI/UX | `operator/roles/designer.md` (Art direction first), `ui-review/SLOP.md`, the project's `DESIGN.md` | `impeccable`, `make-interfaces-feel-better`, `web-interface-guidelines`, `design-system`, `ui-review`, `design-critic` agent |
| 3D games, Steam | `game-3d` (three.js + Electron, decided 2026-10-07) | `game-3d/refs/` (camera, game feel, levels, glTF, lighting, perf, Steam, `vfx-nodes.md`) |
| 2D and web games | `toolbox/catalog/data-web.md` (Phaser, PixiJS, Poki, CrazyGames) | `toolbox/catalog/money.md` (H5 game ads) |
| Visual novels and story games (Ren'Py: setup, art slots, playthrough test, Windows build, laptop delivery) | `docs/game-pipeline.md` (all files, animation, scenes, scene briefs), `docs/two-figure-scenes.md`, `docs/renpy.md`, `storyteller` skill | `docs/renpy-template/`, `docs/character-workflow.md` (renders) |
| Roblox | `roblox` | `toolbox/catalog/roblox.md` (run and see), `studio` (PC) |
| 3D models, characters | `docs/character-workflow.md` | `blender-body` (rigged body: base, shape keys, pose tests, reviewing; pro avatar anatomy in `booth-avatars.md`), `game-3d` (VRM pipeline), `studio` (Blender on the PC) |
| Videos and ads (the studio: Producer, Writer, Director, Sound, Editor, Motion, Critic) | `video-studio` | `video-studio/learnings.md`, `video-studio/formats.md` (mascot-explainer, POV magic, blockout to AI video), `market` §4 (ads law) |
| Social media: posting, comments, DMs, idea backlog, brand accounts, brand deals | `social-team` | `social-team/learnings.md`, `market` §4 and §6 |
| Video and photo edits | `media-editing` | `watch` (understand a video), `toolbox/catalog/video-audio.md` (AI video, voice, music), `docs/research/2026-10-24-video-batch.md` (29 shared videos, verdicts) |
| AI features, local models | `toolbox/catalog/ai.md` | the built-in `claude-api` skill; `docs/research/2026-10-07-own-local-model.md` |
| Marketing, SEO | `market` | `seo`, `market-research`, `product-lens`, `toolbox/catalog/growth.md` |
| Anything else | `toolbox` (pick a plugin, MCP, API or library) | `search-first` |

Unity and Unreal are not used (they need the editor on the PC for every look); Godot only for consoles.

## One home per rule

| Rule | Home | Others only link |
|---|---|---|
| Org, accounts, where secrets live | `CLAUDE.md` (The world) | `publish` skill, `docs/WORKFLOW.md` (PC work) |
| Deploy or delete a page (the steps) | `docs/USING.md` | operator `run.md`, `briefs.md`; detail in `publish` |
| Where a lesson goes (the decision tree) | `docs/MAP.md` (Start here) | `CLAUDE.md` (Lessons stick), `docs/WORKFLOW.md` (Learning) |
| Project memory holds state only (its shape) | `operator/templates/project-memory.md` | `operator/roles/project-manager.md`, `docs/WORKFLOW.md` |
| Asks ledger (every ask of yskills becomes a thread or a rule in claude-setup; memory only points; blocked-thread sweep) | `CLAUDE.md` (Lessons stick) | `operator/roles/project-manager.md` |
| Ask rule (what needs yskills) | `CLAUDE.md` (How to work) | operator `SKILL.md`, `docs/USING.md` |
| Auto-run, pauses and taste calls | `CLAUDE.md` (How to work) | operator `SKILL.md`, `docs/WORKFLOW.md` |
| How a game build is played before the gate (blind pass, full run, death, ad hooks; the report and its seven verdicts) | `operator/roles/playtester.md`, template `operator/templates/playtest-report.md`, checked in game CI by `publish/templates/new-game/scripts/playtest-check.mjs` (+ `scripts/playtest-check.test.mjs`) | `operator/run.md` (step 5), `game-3d` |
| The words of a site or app (voice, terms, German and English strings, errors, empty states) | `operator/roles/content-designer.md`, template `operator/templates/copy-deck.md`, checked by `ui-review/scripts/copy-check.mjs` | `roles/tester.md`, `ui-review`, `SLOP.md` 9 |
| What a site, app or game measures (events, money metric, legal basis, tools with prices, the weekly numbers line) | `operator/roles/analytics.md`, template `operator/templates/tracking-plan.md`, checked by `market/scripts/analytics-check.mjs` | `market` §5, `roles/tester.md`, `docs/hq-rows.md` |
| Cards and votes (who posts them, the thread-to-coordinator loop, screenshots on a vote card per visual choice); yskills reads only the project chat | `CLAUDE.md` (How to work) | `briefs.md` (b), `roles/project-manager.md` |
| Co-founder | `CLAUDE.md` (How to work) | `roles/*.md` (one role-specific line each) |
| Literal mode and cost | the brief block in `briefs.md` | `roles/*.md` (one pointer each) |
| Merge policy, 5/5 gate | `gate.md` (Merge policy) | `CLAUDE.md`, `docs/WORKFLOW.md`, `roles/tester.md` |
| Models | the one line in `docs/WORKFLOW.md` (Models) | everything else links it; CI fails on a model id outside that line |
| Context guard numbers (warn 250k, hand off 350k) | `global/context-guard.mjs` | `CLAUDE.md`, `README.md` |
| Remote Control on the PC | `docs/WORKFLOW.md` (PC work) | operator `SKILL.md` |
| UI rules | `CLAUDE.md` (UI) | `roles/designer.md`, `ui-review` (screenshots, the load-once check, run videos via `desktop.sh`) |
| What looks AI-made (the slop list) | `.claude/skills/ui-review/SLOP.md` | `CLAUDE.md` (UI), `design-critic`, `roles/designer.md`, `gate.md` check 5 |
| Art direction before any screen (references, palette, type) | `operator/roles/designer.md` (Art direction first), checked by `ui-review/scripts/design-check.mjs` | `gate.md` check 5, `game-3d`, the game template |
| How a game plays before it is built (core loop, run length, difficulty, feedback, ad hooks, references) | `operator/roles/game-designer.md`, template `operator/templates/game-design.md`, checked by `game-3d/scripts/gdd-check.mjs` | `game-3d` (§1b), `roles/tester.md` |
| How a game sounds before it is built (sound palette per feedback moment, music plan, mix bar, mute, autoplay, KB budget, licences) | `operator/roles/audio.md`, template `operator/templates/audio.md`, checked by `game-3d/scripts/audio-check.mjs` | `game-3d`, `roles/game-designer.md`, `roles/tester.md` |
| How a research report is made (primary sources, describe before judging, numbers as read, `Not checked:`) | `operator/roles/researcher.md` (Method), checked by `scripts/research-check.mjs` | `templates/research.md`, `run.md` |
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
