# Map: where everything lives and what it owes

One page to find any part of this setup. Each rule has **one home**; every other file links to
that home instead of restating it. When two files disagree, the home wins and the other gets
fixed.

## Start here

Four layers, each with one job. A fact lives in exactly one layer.

| Layer | What | Where | Who writes | Loaded |
|---|---|---|---|---|
| Rules and lessons | every rule, lesson and how-to | claude-setup, one home each, indexed here; product lessons in `<product repo>/docs/LESSONS.md` | threads, through gated PRs | automatically with a checkout; elsewhere `team-guard` puts `CLAUDE.md` itself (fresh from main) into context |
| State | goal, live projects, pending on yskills, open threads, products | the project's `MEMORY.md` only, shape in `.claude/skills/operator/templates/project-memory.md` | the coordinator at milestones; threads their own line | automatically, every start |
| Boot text | how a session gets to the other layers | Project settings > Project instructions; a pointer, never a rule | yskills pastes, once | every session of that project |
| History | research, audits, handoffs, screenshots | `/mnt/project-files/<project>/` and `docs/archive/` | threads | only when a brief names it |

What every session does at start:

| Surface | Reads first | Then |
|---|---|---|
| Coordinator (project chat) | `/mnt/project-files/claude-setup/COORDINATOR-CARD.md` (Spawn rule, Models, Sizes, Roster, Kits, pre-flight; rendered by `global/card-render.mjs`, which a thread start runs when the card is stale; CLI `scripts/coordinator-card.mjs`), then `MEMORY.md`, the thread board | `roles/project-manager.md` Session start; a part the card lacks only through a setup thread (the coordinator has no Bash and no repo); reconciles board and state |
| Thread | its brief (first line `Role: · Kit: · Size:`), `MEMORY.md`; its Roster row and playbook arrive in context by themselves (`rule-guard`) | `add_repo` claude-setup, `CLAUDE.md`, this section, [`TEAMS.md`](TEAMS.md) (Coordinator or thread), never the Spawn rule; for a product also that repo's `CLAUDE.md` and `docs/LESSONS.md` |
| Claude Code on the laptop | first `git fetch && checkout main && pull` of the claude-setup clone ([`pc-claude-user.md`](pc-claude-user.md), Fresh main first), then `~/.claude/CLAUDE.md` | the project's `CLAUDE.md`; auto-memory is a scratchpad |
| New claude.ai project | `hi Luna`, then the coordinator card (`docs/USING.md`, Start a project) | as a coordinator; its first session sweeps old memory into the repo |
| Plain chat (no project) | yskills' user preferences | this section; the `operator` skill sizes the job; no memory |

The thread board is read at every coordinator start and wins over memory.

Each thread reads only the Read-first files of its own role from its Kits row. A brand-new project with no memory skips the move step of the memory check, writes `MEMORY.md` from the template and says so in one line.

### Where a lesson goes

1. A mechanical pattern (a banned call, a file rule, a number): a check in `scripts/` or CI, not text.
2. True for every project: the home named in One home per rule below; no home yet: add a row there.
3. True for one product only: `<product repo>/docs/LESSONS.md` (template `.claude/skills/operator/templates/lessons.md`), dated, newest last.
4. State (what is open, who owes what): the `MEMORY.md` section it belongs to.
5. Everything else (how the day went, a dead end, a report): `/mnt/project-files/<project>/`; nothing to do.

## What loads when

| Loads | What | Cost (tokens, est.) |
|---|---|---|
| Every session | `CLAUDE.md` (~2.4k), `.claude/rules/ecc/common/*`, one line per skill and agent | ~5k |
| Every session without a checkout (project chat, product repos) | `CLAUDE.md` and the coordinator card, put into context by `team-guard` (`scripts/check.mjs` keeps each under 9,800 characters) | ~4.5k |
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
| Teams | `docs/TEAMS.md` | The Spawn rule, the Models line, sizes S/M/L, the one pipeline, the roster (every role's job, when it is called, thread or subagent, model) and the Kits |
| Run a project | `.claude/skills/operator/` | `SKILL.md` size, roles, files, setup loop, cost; `run.md` the detail of the nine pipeline steps (Project Manager only); `gate.md` the 5/5 gate and the one merge policy; `briefs.md` the three briefs, key cards and the block every thread brief starts with; `roles/<role>.md` one playbook per role; `templates/` files copied into a project (`loop/` the feedback inbox, `mailbox/` Claude's own e-mail inbox Worker) |
| Thread brief | `docs/templates/thread-brief.md` | The fixed brief a coordinator copies for every thread start; `global/team-guard.mjs` refuses an incomplete one once, with every missing line (and a `Threads:` line proving `list_threads` was checked) |
| Pipeline gates (cast sheet, fit coverage, look switches, drivers, previews, garment dupes) | `.claude/skills/operator/gate.md` (Asset PRs, Pipeline gates) | `scripts/pipeline-gates.mjs` (+ test), `scripts/blender/dump_drivers.py`, `scripts/blender/look_switches.py`, guard `dupeCheckMissing` in `global/rule-guard.mjs`, `docs/preproduction-workflow.md` |
| Roadmap for yskills | `docs/WORKFLOW.md` | The roadmap in plain words, the token budget, learning and memory check (models: `docs/TEAMS.md`) |
| Other own skills | `.claude/skills/<name>/` | `new-skill`, `legal`, `sell`, `market`, `store`, `store-publish`, `publish`, `scaffold`, `onboard-project`, `ship-check`, `ui-review`, `toolbox`, `game-3d`, `game-ux`, `roblox`, `studio`, `blender-body`, `storyteller`, `watch`, `media-editing`, `video-studio`, `social-team`, `twin` |
| Vendored skills, agents, rules | `.claude/skills`, `.claude/agents`, `.claude/rules/ecc` | ECC subset (`config/ecc.json`, refreshed by `scripts/sync-ecc.mjs`), impeccable, web-interface-guidelines, ponytail, claude-video (`THIRD_PARTY.md`); never hand-edited |
| Own agents | `.claude/agents/` | `design-critic`, `evaluator`, `legal-reviewer`, `red-team` |
| Skills: where they load, how a new one starts | `.claude/skills/new-skill/` | Project threads load only plugin skills: `mods/setup-skills` (core) and `mods/setup-domains` (games, video, social, stores); a skill idea is a PR, never a `propose_skills` card |
| PC install | `install.mjs`, `global/`, `config/plugins.json`, `mods/` (team; setup-skills and setup-domains are meant for cloud threads), `.claude-plugin/marketplace.json` | Copies this repo into `~/.claude`, settings, status line, context guard, plugins, the team mod |
| Claude's PC user | `docs/pc-claude-user.md` | What differs on the `Claude` Windows user (portable Git, env var, paths) and what still needs hands |
| Laptop folders (the structure rules: tree, rules for every thread, "From a cloud thread", path holders) | `docs/laptop-folders.md` (`#from-a-cloud-thread`) | The ONE home: where each kind of thing lives on the Claude laptop and how every thread, laptop or cloud, creates and finds it; linked from `briefs.md` and every role that touches the laptop; test rules in the project files `plans/STUDIO-RULES-SPEC.md` |
| Paths (root `STUDIO_ROOT`, one table of folder names, resolvers, lint) | `config/paths.json`, `scripts/paths.mjs`, `scripts/paths.py`, `scripts/paths-lint.test.mjs` | `docs/laptop-folders.md` (Path holders) |
| Cloud threads | `cloud/bootstrap.sh` (paste once), runs `cloud/setup.sh` | Plugins and the guards in a cloud environment (Project settings > Cloud environment) |
| HQ rows | `docs/hq-rows.md` | The `## Jetzt` block every project keeps in `PROGRESS.md`, the `ceo` order issues, and what each Project Manager writes into HQ (the page itself lives in yverse-studio/company-xy) |
| Clothing pipeline | `docs/clothing-pipeline.md` | How garments are stored, fitted once per base and inherited by every character (follow keys, masks, dress script, naming, backups), moving existing garments, the clipping numbers of the done report (VRM/GLB: `scripts/clipping.mjs`, + `scripts/clipping.test.mjs`; `.blend` characters: `scripts/blender/clearance.py`, mandatory) |
| Character creator | `docs/character-creator.md` | The engine-independent data design for player-made characters: catalogue, sparse look file with migration, loading order, solid skin under clothes (occlusion masks), poses as IK targets, undo per gesture, the creator checklist, plus the lessons |
| Game pipeline | `docs/game-pipeline.md` | Where every game file lives (laptop `lib\` + `projects\games\`, game folder, project files), how to put an animation on a character, build a scene, write a chapter, plus the lessons |
| Script sprawl in a pipeline project | `scripts/cxy/README.md` | One front door for a project's tool scripts (registry, runners, OK/RED output), the script inventory (canonical, fork, duplicate, dead) and the safe archive with undo; never edits proven tools |
| Game pipeline template | `docs/game-pipeline-template.md` | Generic skeleton for any render-based game: one `PIPELINE.md` + path checker, shared asset library with a `STATUS.md` per asset, gates (4.8, marked images, expensive plans/gates, cheap builds), one Blender lane, brief stamp, clean end, lessons |
| Game in an hour | `docs/game-in-an-hour.md` | Playbook for the next Ren'Py story game: file layout, names in `characters.json`, scene slots with three views and camera A/B, look-intro, muted off-screen test run, what is not proven yet |
| Pre-production (concept, cast, look, world, outline, pilot) | `docs/preproduction-workflow.md` | The fixed order before production, what the pros do, our gaps, standing rules; sheet template `docs/templates/character-bible.md` |
| Characters | `docs/character-workflow.md` | The one way to make a 3D character and show it to yskills: reference, build, self-check, comparison sheet, gate, library |
| Base + delta (characters) | `docs/base-delta.md` | The fixed rule (body fixes go into the base, characters only get details), scale 1, the delta file, rebuild (`scripts/blender/delta*.py`), the marker proof, topology break, scale migration, the Blender RAM check |
| Using it (for yskills) | `docs/USING.md` | One phone page: how to start an app, deploy or delete a page in one shot, what you see, what it costs |
| Project registry | `projects/` | One `<name>.json` per project the `new-project` workflow made; `delete-project` needs it |
| GitHub owner migration (plan B if the account stays suspended) | `docs/github-migration.md`, `scripts/migration/` | Inventory of clones and bundles, copy to a new owner, the hands steps and what points at the old owner |
| GitHub rules (what GitHub forbids, what we do: no 18+ on GitHub, no bulk activity, one account, no big binaries; small changes batched as patches, not own PRs) | `docs/github-rules.md` | The AUP rows and our rule per row |
| After launch | `docs/LOOP.md` | Errors and feedback become issues and fix threads |
| Setup loop | operator `SKILL.md` (Setup loop) | Friction with this repo becomes a `loop:setup` issue, then a fix thread through the gate; without the GitHub App a block in the [lessons inbox](../.claude/skills/operator/templates/lessons-inbox.md) |
| Test runs | `docs/TEST-PROJECTS.md` | How the setup is tested end to end, and what each run taught |
| Why it is built this way | `docs/RESEARCH.md`, `docs/research/` | Dated research notes; history, not rules |
| Lessons per project | `docs/LESSONS-2026-10-11.md` | Company XY: liked, not liked, quality problems with the fix in force, the next game |
| Lessons per project | `docs/LESSONS-2026-11-12.md` | GameDev 11-11 to 11-12: 19 mistakes with cause and the home of each fix (gate silhouette row, reuse first, round count per asset, what the coordinator may say, RAM and hands steps, role card) |
| Role boundary (a role leaves another role's files to their owner) | `docs/hands-off.md` | enforced by `handsOff` in `global/rule-guard.mjs`; a thread with no valid Roster role is locked (`scripts/role-lock.test.mjs`) |
| Incident: the gate loop | `docs/incidents/2026-11-12-gate-loop.md` | vacation-game shell #13: 11 rounds against a limit of 6; causes, the fix homes, what the best setups do |
| Lessons homes | [.claude/skills/game-3d/starter/learnings.md](../.claude/skills/game-3d/starter/learnings.md), [.claude/skills/operator/roles/animator.md](../.claude/skills/operator/roles/animator.md), [.claude/skills/operator/roles/archivist.md](../.claude/skills/operator/roles/archivist.md), [.claude/skills/operator/roles/sound-designer.md](../.claude/skills/operator/roles/sound-designer.md), [.claude/skills/operator/roles/analytics.md](../.claude/skills/operator/roles/analytics.md), [.claude/skills/operator/roles/audio.md](../.claude/skills/operator/roles/audio.md), [.claude/skills/operator/roles/content-designer.md](../.claude/skills/operator/roles/content-designer.md), [.claude/skills/operator/roles/designer.md](../.claude/skills/operator/roles/designer.md), [.claude/skills/operator/roles/game-designer.md](../.claude/skills/operator/roles/game-designer.md), [.claude/skills/operator/roles/legal.md](../.claude/skills/operator/roles/legal.md), [.claude/skills/operator/roles/marketer.md](../.claude/skills/operator/roles/marketer.md), [.claude/skills/operator/roles/playtester.md](../.claude/skills/operator/roles/playtester.md), [.claude/skills/operator/roles/programmer.md](../.claude/skills/operator/roles/programmer.md), [.claude/skills/operator/roles/project-manager.md](../.claude/skills/operator/roles/project-manager.md), [.claude/skills/operator/roles/researcher.md](../.claude/skills/operator/roles/researcher.md), [.claude/skills/operator/roles/reviewer.md](../.claude/skills/operator/roles/reviewer.md), [.claude/skills/operator/roles/security.md](../.claude/skills/operator/roles/security.md), [.claude/skills/operator/roles/tester.md](../.claude/skills/operator/roles/tester.md), [.claude/skills/social-team/learnings.md](../.claude/skills/social-team/learnings.md), [.claude/skills/store-publish/SKILL.md](../.claude/skills/store-publish/SKILL.md), [.claude/skills/video-studio/learnings.md](../.claude/skills/video-studio/learnings.md), [.claude/skills/video-studio/roles/director.md](../.claude/skills/video-studio/roles/director.md), [.claude/skills/video-studio/roles/writer.md](../.claude/skills/video-studio/roles/writer.md), [docs/game-pipeline.md](game-pipeline.md), [docs/game-pipeline-template.md](game-pipeline-template.md), [docs/clothing-pipeline.md](clothing-pipeline.md), [docs/outbox.md](outbox.md), [docs/permissions.md](permissions.md), [docs/character-creator.md](character-creator.md) | Every file with a `## Lessons` or `## Learnings` heading, or named `learnings.md`; `node scripts/check.mjs` fails when one is not linked here |
| State template | `.claude/skills/operator/templates/project-memory.md` | The shape of a project's `MEMORY.md`: four sections (Goal, Plan pointer, Live, Products), under 3 KB |
| Product lessons template | `.claude/skills/operator/templates/lessons.md` | The `docs/LESSONS.md` of a product repo |
| Archive | `docs/archive/` | Raw copies of retired memory and reports; history only, never a rule |
| Checks | `scripts/check.mjs`, `scripts/brief.mjs` (+ `scripts/brief.test.mjs`: builds a thread brief that passes team-guard from the Roster and Kits), `scripts/pr-overlap.mjs` (+ `scripts/pr-overlap.test.mjs`, run by pre-pr: warns when another branch changes the same files), `scripts/rule-budget.mjs` (+ `scripts/rule-budget.test.mjs`, baseline `config/rule-budget.json`), `scripts/guards.test.mjs`, `.github/workflows/ci.yml`, `.claude/skills/publish/templates/new-project/scripts/floor-guard.mjs` (+ `scripts/floor-guard.test.mjs`) | Rule budget: the unguarded prose rule lines per file only fall (frozen in config/rule-budget.json; a fall counts only when lines with any prohibition wording fall with it, so rewording is no cut), a new one needs a guard tag on an existing file; frontmatter, names, models, ECC subset, plugin lists, relative links; own skill descriptions (200 characters, a "Use ..." sentence), `maxTurns` on own agents, no hooks in settings files; the deny rules, hook hygiene and the never/always tags; floor guard: a PR that skips or deletes a test (matched test by test, so a new unrelated test does not offset it), drops assertions, adds a suppression or stub or lowers a coverage threshold fails unless a commit says `floor-ok: <reason>` (every new project's CI runs the same script); `publish/templates/new-project/scripts/project-checks.mjs` (+ `scripts/project-checks.test.mjs`): every new project's CI also runs the design, copy, tracking-plan (and for a game game-design and sound) checks on the files a PR changes |

## Expertise by domain

What Claude already knows, fetched only when a job needs it. A skill named here lives at
`.claude/skills/<name>/SKILL.md` in claude-setup: when it is not in your skill list (claude-setup
added as a second repo, or a plain chat), read that file by path, then the files it links.

| Domain | Read first | Then, when needed |
|---|---|---|
| Web app, stack, deploy | `scaffold`, `publish`; `docs/USING.md` (deploy or delete a page); `docs/tech-traps.md` (one-line traps) | `nuxt4-patterns`, `vue-patterns`, `vite-patterns`, `api-design`, `database-migrations`, `e2e-testing` |
| Running a project | `operator` (roles, gate, briefs) | `operator/roles/<role>.md` |
| Payments, Stripe, shop | `sell` (Checkout, subscriptions, Stripe on Workers, shop law, go-live) | `sell/stripe-workers.md`, `keys.md`, `legal-de.md`, `physical.md`; `toolbox/catalog/money.md` (ads, in-app, VAT) |
| App stores | `store` (Capacitor, RevenueCat, TestFlight, review) | `toolbox/catalog/app-platform.md` |
| Game as APK and on Google Play (workflow, Learnings) | `store-publish` | `publish` (the website), `game-3d` (Steam later) |
| German law, DSGVO | `legal` | `legal-reviewer` agent; `sell/legal-de.md` for shops |
| Security | the built-in `/security-review` command | `security-reviewer`, `red-team` agents |
| Design, UI/UX | `operator/roles/designer.md` (Art direction first), `ui-review/SLOP.md`, the project's `DESIGN.md` | `impeccable`, `web-interface-guidelines`, `ui-review`, `design-critic` agent |
| 3D games, Steam | `game-3d` (three.js + Electron, decided 2026-10-07) | `game-3d/refs/` (camera, game feel, levels, glTF, lighting, perf, Steam, `vfx-nodes.md`, `crowds-and-lod.md`, `real-map-overworld.md`) |
| 2D and web games | `toolbox/catalog/data-web.md` (Phaser, PixiJS, Poki, CrazyGames) | `toolbox/catalog/money.md` (H5 game ads) |
| Visual novels and story games (Ren'Py: setup, art slots, playthrough test, Windows build, laptop delivery) | `docs/game-pipeline.md` (all files, animation, scenes, scene briefs), `docs/two-figure-scenes.md` (gate, image language, natural motion, scripting traps, one-shot goal), `docs/renpy.md`, `storyteller` skill | `docs/renpy-template/`, `docs/character-workflow.md` (renders), `docs/clothing-pipeline.md` (garments per base) |
| Roblox | `roblox` | `toolbox/catalog/roblox.md` (run and see), `studio` (PC) |
| Character creator (sliders, saved characters, loading into scenes, openings and skin under clothes) | `docs/character-creator.md` | `docs/clothing-pipeline.md`, `blender-body` |
| 3D models, characters | `docs/character-workflow.md` | `blender-body` (rigged body: base, shape keys, pose tests, reviewing, rig conventions: finger axis, IK switches, ring groups; pro avatar anatomy in `pro-avatars.md`), `game-3d` (VRM pipeline; `refs/low-poly.md`, `refs/asset-sources.md`), `studio` (Blender on the PC) |
| Videos and ads (the studio: Producer, Writer, Director, Sound, Editor, Motion, Critic) | `video-studio` | `video-studio/learnings.md`, `video-studio/formats.md` (mascot-explainer, POV magic, blockout to AI video), `video-studio/templates/launch-video/` (15 s launch promo from any repo, free), `market` §4 (ads law) |
| Social media: posting, comments, DMs, idea backlog, brand accounts, brand deals | `social-team` | `social-team/pipeline.md` (idea to post to numbers, every role), `social-team/learnings.md`, `social-team/xyskillsx-style.md` (his personal style: keep, raise, never), `market` §4 and §6, `docs/research/2026-10-26-claude-video-autopost.md` (what people use, ideas-to-posts app) |
| His digital twin (voice clone, real face with the mouth re-synced; recording ask, laptop tool, Critic lines) | `twin` | `twin/record.md`, `twin/laptop-setup.md`, `social-team/xyskillsx-style.md`, `video-studio/roles/critic.md` |
| Video and photo edits | `media-editing` | `watch` (understand a video), `toolbox/catalog/video-audio.md` (AI video, voice, music), `docs/research/2026-10-24-video-batch.md` (29 shared videos, verdicts) |
| AI features, local models | `toolbox/catalog/ai.md` | the built-in `claude-api` skill; `docs/research/2026-10-07-own-local-model.md`, `docs/research/2026-10-26-free-models-in-workflow.md` (Ollama plan, 8 GB limits); `docs/luna2.md` (free fallback agent when Claude usage is out), `docs/luna2-handoff.md` (state for it) |
| Marketing, SEO | `market` | `seo`, `product-lens`, `toolbox/catalog/growth.md` |
| Anything else | `toolbox` (pick a plugin, MCP, API or library) | |

Unity and Unreal are not used (they need the editor on the PC for every look); Godot only for consoles.

## One home per rule

| Rule | Home | Others only link |
|---|---|---|
| Org, accounts, where secrets live | `CLAUDE.md` (The world) | `publish` skill, `docs/WORKFLOW.md` (PC work) |
| Coordinator card (what the project chat reads, its pre-flight) | `global/card-render.mjs` (output `/mnt/project-files/claude-setup/`: `COORDINATOR-CARD.md`, `ROSTER.md`, `briefs/<role>.md`, all rendered from `BRIEF_FIELDS` and `docs/TEAMS.md`; refreshed by every thread start when the card's hash is stale; CLI `scripts/coordinator-card.mjs`) | `roles/project-manager.md`, `operator/templates/project-instructions.md` |
| Live board (who is doing what: one `NOW.md` per project, a line per job, 24 h archive) | `docs/USING.md` (Live board), template `docs/templates/NOW.md` | `CLAUDE.md` (How to work), `operator/briefs.md` (Done when), the laptop's `_claude/_queue/WHO.md` (name `who` in `config/paths.json`) stays a separate lane lock |
| Masterplan (the coordinator's one living plan: roadmap first, item status, update on every event, the "Stand?" answer, pings, the Custom view) | `roles/project-manager.md` (Masterplan), file `/mnt/project-files/PLAN.json` (template `docs/templates/PLAN.json`, written only by `scripts/plan.mjs` + `scripts/plan.test.mjs`) | coordinator card (pre-flight), `docs/research/2026-11-12-masterplan-sota.md` |
| Close finished threads (resolve or nudge, the daily sweep) | `roles/project-manager.md` (Close threads) | coordinator card, `templates/loop/routine.md` (step 11), `global/rule-guard.mjs` (stop) |
| Teams, roles, sizes, the pipeline, the Kits (routed per task), the model per role | `docs/TEAMS.md` | `CLAUDE.md` (Teams), `operator/SKILL.md`, `operator/run.md`, `roles/project-manager.md`; `global/team-guard.mjs` enforces `model` |
| Deploy or delete a page (the steps) | `docs/USING.md` | operator `run.md`, `briefs.md`; detail in `publish` |
| Where a lesson goes (the decision tree) | `docs/MAP.md` (Start here) | `CLAUDE.md` (Lessons stick), `docs/WORKFLOW.md` (Learning) |
| Pre-PR check (the one command that runs what CI runs; git pre-push hook on every machine) | `scripts/pre-pr.mjs` | `CLAUDE.md` (How to work), `global/git-hooks/pre-push`, `install.mjs`, `cloud/setup.sh`, `.github/workflows/ci.yml` |
| Fixes remove the cause (workaround only on yskills' word, labelled, deleted later) | `docs/WORKFLOW.md` (Fixes) | `CLAUDE.md` (Code), operator `gate.md` (diagnosis after two failed checks), `roles/programmer.md` |
| Project retro (errors and good practice at ship or delete) | `docs/WORKFLOW.md` (Learning, Project retro) | `publish` skill (Delete a project), `templates/lessons.md` |
| Memory form verdict (why files, not Obsidian, Graphify or graph memory) | `docs/RESEARCH.md` (Memory form) | `docs/WORKFLOW.md` (Learning) |
| Project memory holds state only (its shape) | `operator/templates/project-memory.md` | `operator/roles/project-manager.md`, `docs/WORKFLOW.md` |
| Where a Blender job runs (cloud first, estimate before each job, laptop for GPU/MCP/asked/failed; measured render times) | `.claude/skills/studio/SKILL.md` (Where Blender runs) | `.claude/skills/video-studio/templates/blender-cloud/`, `operator/roles/animator.md` |
| Long laptop jobs (watchdog, Blender limits, GPU and sleep check, one-line failure report, overnight run) | `docs/pc-claude-user.md` (Long laptop jobs) | `scripts/laptop-job.mjs`, `scripts/ram-ledger.mjs` (RAM claims, owner snapshot), `scripts/laptop-slots.mjs` (Blender limits: one job at a time, 2 instances; progress-file heartbeat), `operator/roles/project-manager.md`, `programmer.md`, `tester.md` |
| Laptop drops, RC watchdog and broad permissions template | `docs/pc-claude-user.md` (Dropped sessions and permissions) | `scripts/laptop/rc-watchdog.ps1`, `scripts/laptop/install-rc-watchdog.ps1`, `scripts/laptop/claude-settings.template.json`, `scripts/laptop/install-claude-settings.ps1` |
| Asks ledger (every ask of yskills becomes a thread or a rule in claude-setup; memory only points; blocked-thread sweep) | `CLAUDE.md` (Lessons stick) | `operator/roles/project-manager.md` |
| Ask rule (what needs yskills) | `CLAUDE.md` (How to work) | operator `SKILL.md`, `docs/USING.md` |
| Every ask of yskills carries its clickable link (thread, PR, setting, folder) | `docs/pc-claude-user.md` (What still needs yskills' hands) | `CLAUDE.md`, coordinator card, `global/rule-guard.mjs` (replyRule) |
| Permission prompts, the allow list and autoMode, safety-check refusals and the way around each | `docs/permissions.md` (settings in `global/settings.json`) | `CLAUDE.md`, operator `SKILL.md`, `gate.md`, `README.md`, `docs/pc-claude-user.md` |
| Workflows with keys run from main only (`environment: production`) | `docs/permissions.md` (Layer 4) | `docs/permissions.md` only |
| Auto-run, pauses and taste calls | `CLAUDE.md` (How to work) | operator `SKILL.md`, `docs/WORKFLOW.md` |
| How a game build is played before the gate (blind pass, full run, death, ad hooks; the report and its nine verdicts, Controls and World life first) | `operator/roles/playtester.md`, template `operator/templates/playtest-report.md`, checked in game CI by `publish/templates/new-game/scripts/playtest-check.mjs` (+ `scripts/playtest-check.test.mjs`) | `operator/run.md` (step 5), `game-3d` |
| The words of a site or app (voice, terms, German and English strings, errors, empty states) | `operator/roles/content-designer.md`, template `operator/templates/copy-deck.md`, checked by `ui-review/scripts/copy-check.mjs` | `roles/tester.md`, `ui-review`, `SLOP.md` 9 |
| What a site, app or game measures (events, money metric, legal basis, tools with prices, the weekly numbers line) | `operator/roles/analytics.md`, template `operator/templates/tracking-plan.md`, checked by `market/scripts/analytics-check.mjs` | `market` §5, `roles/tester.md`, `docs/hq-rows.md` |
| Cards and votes (who posts them, the thread-to-coordinator loop, screenshots on a vote card per visual choice); yskills reads only the project chat | `CLAUDE.md` (How to work) | `briefs.md` (b) |
| Co-founder | `CLAUDE.md` (How to work) | `roles/*.md` (one role-specific line each) |
| No windows on yskills' screen (headless only, unless he asked) | `docs/pc-claude-user.md` (No windows) | `global/rule-guard.mjs` (`opensWindow`) |
| Who looks at and judges work (only the gate and yskills; every other role executes and runs fixed scripts) | `docs/TEAMS.md` (Who checks) | `roles/animator.md`, `roles/project-manager.md`, `docs/character-workflow.md`, `docs/game-pipeline.md`, `docs/two-figure-scenes.md` |
| What the Archivist does and does not do (documents scripts, workflows, gate passes, indexes; never files or reviews references) | `operator/roles/archivist.md` | `docs/TEAMS.md` (Roster), `docs/laptop-folders.md` (Where reference images go), `global/rule-guard.mjs` (`archivistFiles`) |
| Literal mode and cost | the brief block in `briefs.md` | nothing (the role files no longer repeat it) |
| Offline outbox of a capture app (what leaves it, which errors may drop data, discard, form reset) | `docs/outbox.md` | `roles/programmer.md`, `social` repo |
| Merge policy, 5/5 gate | `gate.md` (Merge policy) | `CLAUDE.md`, `docs/WORKFLOW.md`, `roles/tester.md` |
| Hard gate round counter (3 rounds, Fable director for 3, then a card; no merge under 4.5/4.8) and the picture card before a new hub, start screen or style | `gate.md` (Rounds; Picture card first), enforced by `global/gate-rounds.mjs` through `global/rule-guard.mjs`, tests `scripts/gate-rounds.test.mjs` | `docs/TEAMS.md` (Models line), `roles/project-manager.md`, `scripts/coordinator-card.mjs`; research: `docs/research/2026-11-12-loop-limits-and-hook-enforcement.md` |
| Task plan, plan check and approval per asset (`planReady()`; PLAN.md structure check and its template) | [global/task-ledger.mjs](../global/task-ledger.mjs) (`scripts/task-ledger.test.mjs`), [scripts/task-plan-check.mjs](../scripts/task-plan-check.mjs) (`scripts/task-plan-check.test.mjs`), [docs/templates/task-plan.md](templates/task-plan.md) | `global/gate-rounds.mjs` (the ledger file), plan 2026-11-12 section 4 |
| Gate checklists per topic (Garment, Hair, Character, HUD/UI, Animation, Scene render, Asset-Intake; `Topic:` in a Reviewer brief) | [.claude/skills/operator/checklists.md](../.claude/skills/operator/checklists.md) (`scripts/checklists.test.mjs`) | `gate.md` (Scored gates), `scripts/brief.mjs --topic` |
| Score rule for scored gates (4.5 PASS, 2 more rounds, best eligible version, hard checks, judge noise) | `gate.md` (Scored gates) | `two-figure-scenes.md`, `game-pipeline.md`, `roles/animator.md`, `blender-body` |
| Gate for models and garments (measurements + render sheet) | `gate.md` (Asset PRs) | `docs/clothing-pipeline.md`, `character-workflow.md`, `roles/tester.md` |
| Briefs point to guide checks, never weaken them; threads read guides fresh from main | `briefs.md` (Every thread brief starts with, Guides) | none |
| Models (the line, the model per role and per task) | `docs/TEAMS.md` (Models line, Roster) | everything else links it; CI fails on a model id outside that line |
| Context guard numbers (warn 250k, backstop 700k) | `global/context-guard.mjs` | `CLAUDE.md`, `README.md` |
| Handoff triggers | `docs/WORKFLOW.md` (Handoff triggers) | `CLAUDE.md`, `briefs.md`, `project-manager.md`, operator `SKILL.md` |
| Hooks that enforce `CLAUDE.md` lines (no PR mails, real cards, reply cap, one Artifact, conventional commits, no WebFetch in the cloud, video and stop notes, the role card, the canary line, a thread's start receipt: proves the role card was injected and which skills ran and which of its role's skills cannot load here (the file to read instead, read before the reply), never that the role was followed; checked on `post_message` only, so a first decision card carries none; and Luna's kaomoji) | `global/rule-guard.mjs` (+ `scripts/guards.test.mjs`) | `CLAUDE.md` |
| `Prior art:` and `Lessons:` lines in every PR body | `scripts/pr-lessons-check.mjs` | `CLAUDE.md`, `.github/pull_request_template.md`, `operator/briefs.md` |
| Lessons inbox (the one file, block format, Seen rule, the Monday patch) | `operator/templates/lessons-inbox.md` | operator `SKILL.md` (Setup loop), `docs/WORKFLOW.md` (Learning), `briefs.md` |
| Remote Control on the PC | `docs/WORKFLOW.md` (PC work) | operator `SKILL.md` |
| UI rules | `CLAUDE.md` (UI) | `roles/designer.md`, `ui-review` (screenshots, the load-once check, run videos via `desktop.sh`) |
| What looks AI-made (the slop list) | `.claude/skills/ui-review/SLOP.md` | `CLAUDE.md` (UI), `design-critic`, `roles/designer.md`, `gate.md` check 5 |
| Art direction before any screen (references, palette, type) | `operator/roles/designer.md` (Art direction first), checked by `ui-review/scripts/design-check.mjs` | `gate.md` check 5, `game-3d`, the game template |
| Style library (reusable style directions: tokens, captures, do/don't; first: young-cool) | [`ui-review/styles/README.md`](../.claude/skills/ui-review/styles/README.md) | `operator/roles/designer.md` (step 0), `ui-review/TASTE.md` |
| How a game plays before it is built (core loop, run length, difficulty, feedback, ad hooks, references) | `operator/roles/game-designer.md`, template `operator/templates/game-design.md`, checked by `game-3d/scripts/gdd-check.mjs` | `game-3d` (§1b), `roles/tester.md` |
| Who builds and mixes the sound of a product in any medium (scene games, web games, videos, films) | `operator/roles/sound-designer.md` | `roles/audio.md`, `video-studio/roles/sound.md`, `.claude/skills/storyteller/references/08-scene-clips-and-sound.md` |
| How a game sounds before it is built (sound palette per feedback moment, music plan, mix bar, mute, autoplay, KB budget, licences) | `operator/roles/audio.md`, template `operator/templates/audio.md`, checked by `game-3d/scripts/audio-check.mjs`; scene games (Ren'Py): [`docs/sound-template.md`](sound-template.md) (other games' sound, event table, muted checks, licences) | `game-3d`, `roles/game-designer.md`, `roles/tester.md` |
| How a research report is made (primary sources, describe before judging, numbers as read, `Not checked:`) | `operator/roles/researcher.md` (Method), checked by `scripts/research-check.mjs` | `templates/research.md`, `run.md` |
| Character workflow (reference, sheet, likeness gate) | `docs/character-workflow.md` | `roles/programmer.md`, `roles/tester.md`, `roles/designer.md`, `briefs.md` |
| Deploys, the workflows' detail, the two Cloudflare routes, deploy lessons | `publish` skill | `CLAUDE.md`, `docs/USING.md` |
| Live == main (deploy watch every 15 min, `deploy-drift` issues), the preview journey (`journey` status) and preview login | `publish` skill (live smoke test; Preview journey and preview login), `scripts/deploy-watch.mjs`, `scripts/journey.mjs` (verify), template `scripts/journey-gate.mjs` + `.github/workflows/journey.yml` | `gate.md` (UI PRs, Live check after the merge), `roles/tester.md`, `docs/TEAMS.md` (Sizes) |
| Money and shop law | `sell` skill | `docs/WORKFLOW.md` (Selling) |
| Starting a new claude.ai project (`hi Luna`, card, instructions text, Cloud environment + restart) | `docs/USING.md` (Start a project) | the live text in each project's settings |
| An idea or change for a live project | `docs/TEAMS.md` (Sizes, Pipeline) | `CLAUDE.md`, `roles/project-manager.md` |
| How a video or ad is made (roles, pipeline, video lessons) | `video-studio` skill | operator `SKILL.md`, `roles/marketer.md`, `market` |
| Free sound library (CC0 SFX and music, manifest with licence proof, BPM, loudness) | `video-studio/sound/README.md`, checked by `video-studio/scripts/sound_library.py` | `video-studio/roles/sound.md`, `sound-kit.md` |
| How posts go out, auto-post guardrails, comments and DMs, brand accounts | `social-team` skill | operator `SKILL.md`, `video-studio`, `market` §6, `docs/USING.md` |
| Coordinator answers facts from a source read this turn, checks one thread = one role before every `message_thread`, flags PR dependencies at once, decides build details itself (vacation-game 2026-11-12) | `operator/roles/project-manager.md` (Facts, roles and dependencies) | coordinator card (pre-flight), `roles/programmer.md` (`Depends on:` line) |
| A role thread is reused within one plan or PR (message_thread), a new start with an open same-role thread needs `Reuse: none (why)` (yskills 2026-11-12, research verdict partly) | `docs/TEAMS.md` (Reuse rule), checked by `global/team-guard.mjs` (`reuseBlock`) and `scripts/guards.test.mjs` | `operator/briefs.md` (`Reuse:`), `docs/research/2026-11-12-persistent-role-threads-sota.md` |
| Game PRs: Controls and World life pass before any look round | `operator/gate.md` (Game PRs: play before look), checked by `publish/templates/new-game/scripts/playtest-check.mjs` | `roles/playtester.md`, template `playtest-report.md`, coordinator card |
| Real moment first (a level from yskills' life starts with his own words on how it felt) and the GDD's Controls | `operator/roles/game-designer.md` (Real moment first), checked by `game-3d/scripts/gdd-check.mjs` | `CLAUDE.md` (No fog), operator `SKILL.md` (Grill first), `roles/planner.md`, template `game-design.md` |

## Keeping it clean

- A new rule goes into its home and nowhere else; add a row above if it has no home yet.
- A dated quote from yskills goes into the home once; other files point to it.
- `node scripts/check.mjs` fails on a dead relative link.
- A "never" or "always" bullet in `CLAUDE.md`, operator or publish `SKILL.md` ends in `[advisory]` (prose only) or `[guard: deny|ask <rule in global/settings.json>]`, `[guard: test|hook <file>]`. Prefer a guard; the lint fails on an untagged one.
- Research and test-run notes are history: never cite them as the rule.
