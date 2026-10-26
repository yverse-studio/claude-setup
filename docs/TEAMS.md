# Teams: who works on a task, as what, on which model

The one home of the company's roles, the task sizes, the pipeline, the kits and the model per role
(yskills 2026-10-26: every thread ran on Opus, threads played several roles, team rules were spread
over five files). Step detail lives in [`run.md`](../.claude/skills/operator/run.md), the gate in
[`gate.md`](../.claude/skills/operator/gate.md), each role's checklist in its playbook (linked in
the roster). Every other file links here.

## Coordinator or thread

Building a team is the coordinator's job only (yskills 2026-10-26: "they dont need to make a team
in the thread they are one part of it"). Check first which one you are:

- **You are a thread if** your first message is a coordinator brief (a `Model:` and a
  `Role:` line), or your tools have `message_coordinator` but no thread start. Otherwise (the
  project chat, a plain chat, the laptop) you are the coordinator and the Spawn rule below is yours.
- **A thread** is one role, the one its `Role:` line names (no `Role:` line: the role its title
  `<Role> · <what>` names). It reads that role's Roster row and playbook and its kit row's Read
  first files, does that job, and calls as `Agent` subagents only the helpers its Roster row and
  the Sizes row of its size list (Reviewer, Researcher, an Opus checkpoint, ...), each with `model`.
  It never starts a thread, never sizes the task again, never staffs a team and never plays a second
  role; work for another thread-role goes to the coordinator with `message_coordinator` (role,
  topic, files, done-when), and the thread goes on with its own job.

## Spawn rule

Coordinator only (a thread: Coordinator or thread, above).

1. **Task first, then kit, then size.** Every task is routed on its own, never by the project it
   comes from: what it makes picks the kit (a post or reel: `social`; a video: `video`; an app,
   even inside the social project: `app`; a page: `site`; a game: `game`; claude-setup itself:
   `setup`), the kit's row names the roles, the size (below) says how many of them start. The
   project's own kind is only the default when the task names nothing else. The coordinator does
   this lookup for every task without being asked and names kit and size in the brief.
2. **Size.** The task's size (below) decides how much of the kit's team starts. It is the gate's size
   ([`gate.md`](../.claude/skills/operator/gate.md), Gate size): one size per task, picked by the
   table, never by the author.
3. **Threads only for roles that own a long job or talk to yskills:** Planner, Designer, Game
   Designer, Programmer, Tester (size L), Producer, Editor, Social Lead, Marketer. Every other role
   is an `Agent` subagent of the thread that needs it, fresh for each job. A thread never plays a
   second thread-role; it asks the coordinator with `message_coordinator` (role, topic, files,
   done-when) and goes on with its own job.
4. **Every start names its model.** The coordinator's thread start (`mcp__hearthbot__start_thread`, older `start_thread_session`) and `create_session` pass `model` (the
   full id from the Models line); every `Agent` call passes `model` (`haiku`, `sonnet`, `opus`). A
   brief's `Model:` line is text only and sets nothing; without the parameter a thread gets the
   project default and a subagent inherits its parent (tested 2026-10-26: a subagent of an Opus
   thread ran on Opus although `CLAUDE_CODE_SUBAGENT_MODEL` was sonnet; with `model: haiku` it ran
   on Haiku). The `team-guard` hook (`global/team-guard.mjs`) blocks an `Agent` call or thread
   start without `model`.
5. **Agent files load only on the laptop.** A cloud project thread offers only the built-in agent
   types (`general-purpose`, `Explore`, `Plan`; tested 2026-10-26: `code-reviewer` was "not found").
   There, a named agent such as `code-reviewer` or `design-critic` runs as `general-purpose` with
   its `model` and the prompt "Read `.claude/agents/<name>.md` of claude-setup and act as it on:
   ...".
6. **The brief** starts with the block in `operator/briefs.md` and names the role's playbook and
   what the step before handed over.

Models: best fitting model per task, cheapest that fits. Fable (claude-fable-5-1) is rare, drawn from yskills' Max plan: only the architecture or plan of a new product, a problem still stuck after a Sonnet round and an Opus checkpoint, or what yskills names; plus the project chat (coordinator), which yskills sets by hand; if Fable is out of credits or unavailable, Opus takes it without asking. Opus (claude-opus-5-5), the one Opus rule: the Planner; taste (Designer, Game Designer, a pick between variants, the video Critic, the story team's taste roles); the size L gate verdict; a full audit; one checkpoint subagent per S or M task (before committing to an approach, or before "done", or when stuck twice); and the one escalation a roster row names (conflicting findings, a disputed security finding, a contract, a concept or weekly-plan pick, one diagnosis); nothing else. Sonnet (claude-sonnet-5-5) for builds, fixes, research, reviews and the S and M gates. Haiku (claude-haiku-5-5) for a simple reading job, a lookup, a watch, a CI poll. A thread never picks Fable itself. Effort medium unless yskills asks for more. When a newer model ships, use the newest of each tier. A model yskills names is used as named.

## Sizes

| Size | The task | Threads | Subagents it calls | Opus |
|---|---|---|---|---|
| S | a bug fix, a small tweak, docs, skills, config, a question | one, of the role it needs (usually `Programmer · fix <what>`); it runs its own S gate | Reviewer; a Researcher only for an open fact | one checkpoint subagent |
| M | a feature or change of code with no new look, no user input, auth, money or data; a garment move or refit (`gate.md`, Asset PRs) | `Planner · <topic>` (grill, short plan), then `Programmer · <slice>`; the M gate runs in the Programmer's thread | Researcher, Reviewer | the Planner, plus one checkpoint in the Programmer |
| L | a new product, anything a user sees, user input, auth, money, data, a launch | the kit's team (Kits below), a fresh `Tester · PR <n>` per PR | all the kit lists | the Planner, the Designer, the Game Designer, the gate verdict |

A video is the `video` kit and a post the `social` kit at any size; their own pipelines size them.

## Pipeline

One order for every kind. The step numbers are `run.md`'s, so its detail matches.

| Step | Who | S | M | L |
|---|---|---|---|---|
| 1 Grill and brainstorm | Planner (a new product: the coordinator's brainstorm, then the Planner) | - | grill | full |
| 2 Research, including what already exists (`search-first`, every repo and branch, claude-setup) | Researcher subagents, one page each | an open fact only | yes | yes |
| 3 Plan: stress test, slices, criteria (`PLAN.md`, `features.json`) | Planner | - | 5 lines | full |
| 4 Design and docs: art direction, copy, play, sound, tracking | Designer thread; Game Designer thread for a game; Content Designer, Audio, Analytics as subagents | - | - | yes |
| 5 Build | Programmer, one thread per slice | yes | yes | yes |
| 6 Gate, with its lessons step | `gate.md`: in the author thread (S, M), a fresh Tester (L); Reviewer, Security, Legal, Playtester as subagents | S | M | L |
| 7 Launch, 8 Grow | Marketer thread, `publish`, `sell` | - | - | a new product |
| 9 Learn | the gate's lessons step (`gate.md`, After the merge) and `docs/MAP.md` (Where a lesson goes) | yes | yes | yes |

Attacking the plan happens once, in steps 1 and 3 (the grill cards and the stress test); grading the
work happens once, in step 6, by someone who did not build it.

## Roster

The company. Runs as: where the role lives. Model: the tier (the id is in the Models line).

### Company

| Role and playbook | Job | Called when | Runs as | Model |
|---|---|---|---|---|
| Project Manager ([`project-manager.md`](../.claude/skills/operator/roles/project-manager.md)) | talks to yskills, sizes the task, starts every thread with its model, keeps `PROGRESS.md`, HQ rows, the asks ledger; never builds | always | the project chat | as yskills sets it |
| Planner ([`planner.md`](../.claude/skills/operator/roles/planner.md)) | the grill cards, the stress test, `PLAN.md` and `features.json` | sizes M and L, step 1 to 3 | a thread `Planner · <topic>` | Opus; Fable for a new product's architecture |
| Researcher ([`researcher.md`](../.claude/skills/operator/roles/researcher.md)) | what exists already (ours first), what the best do, prices, tools, proof people pay | step 2 | subagents, one page each | Sonnet; Haiku to read; Opus to weigh conflicting findings |
| Designer ([`designer.md`](../.claude/skills/operator/roles/designer.md)) | the look before any screen: references, palette, type, 2-3 drafts, the vote card; reviews every UI PR | size L, step 4; every UI PR | a thread; `design-critic` subagent per UI PR | Opus |
| Content Designer ([`content-designer.md`](../.claude/skills/operator/roles/content-designer.md)) | every word a user reads, German and English | step 4 of a site or app; a PR with a new flow | subagent of the Designer | Sonnet |
| Game Designer ([`game-designer.md`](../.claude/skills/operator/roles/game-designer.md)) | how a game plays: core loop, run length, difficulty, ad hooks | step 4 of a game; a PR that changes play | a thread at game start; subagent for a small play change | Opus |
| Audio ([`audio.md`](../.claude/skills/operator/roles/audio.md)) | how a game sounds, licence-clean and small | after the Game Designer's doc; a PR with a new sound moment | subagent of the Game Designer | Sonnet |
| Analytics ([`analytics.md`](../.claude/skills/operator/roles/analytics.md)) | what is measured and why, the weekly numbers line | step 4 of a site, app or game; a PR with a new user action | subagent of the Planner | Sonnet |
| Programmer ([`programmer.md`](../.claude/skills/operator/roles/programmer.md)) | one slice or fix as one PR, tests first, green CI; runs the S and M gate | every size, step 5 | a thread per slice, never more than three at once | Sonnet; one Opus checkpoint subagent |
| Tester ([`tester.md`](../.claude/skills/operator/roles/tester.md)) | QA: the gate, grades the preview against the criteria; never built it | step 6 | S, M: the author thread; L: a fresh thread | Sonnet; Opus verdict on L |
| Reviewer ([`reviewer.md`](../.claude/skills/operator/roles/reviewer.md)) | reads the diff for bugs, mess, missing tests | every gate | subagent of the gate | Sonnet |
| Security ([`security.md`](../.claude/skills/operator/roles/security.md)) | the diff and the preview attacked like an outsider | user input, auth, money, secrets; before launch | subagent of the gate | Sonnet, effort high on money, auth, secrets; Opus on a disputed finding |
| Playtester ([`playtester.md`](../.claude/skills/operator/roles/playtester.md)) | plays a game build like a stranger | every build that changes play | a fresh subagent of the gate | Sonnet |
| Legal ([`legal.md`](../.claude/skills/operator/roles/legal.md)) | German law must-haves, then pass or fail on the preview | the plan, pages with tracking or checkout, launch | subagent; a thread to write legal texts | Sonnet; Opus for a contract |
| Marketer ([`marketer.md`](../.claude/skills/operator/roles/marketer.md)) | the probe, launch posts, ads, weekly growth | step 7 and 8 | a thread at launch, then the weekly routine | Sonnet |

### Film (`video-studio`)

The pipeline and its Critic gate: [`video-studio`](../.claude/skills/video-studio/SKILL.md). The
Critic is the studio's QA: the first harsh viewer, so yskills never sees a failed cut.

| Role and playbook | Job | Called when | Runs as | Model |
|---|---|---|---|---|
| Producer ([`producer.md`](../.claude/skills/video-studio/roles/producer.md)) | owns one video: brief, concept card, delivery | yskills, the Social Lead or the Marketer asks for a video | a thread `Producer · <video>` | Sonnet; Opus picks the concept |
| Writer ([`writer.md`](../.claude/skills/video-studio/roles/writer.md)) | three concepts, hooks, script, captions | after the brief | subagent of the Producer; a thread for an ad batch | Sonnet |
| Director ([`director.md`](../.claude/skills/video-studio/roles/director.md)) | shots, storyboard, animatic | after the script | subagent of the Producer | Sonnet |
| Sound ([`sound.md`](../.claude/skills/video-studio/roles/sound.md)) | music bed, beat map, SFX, mix | after the animatic passed | subagent of the Producer | Sonnet |
| Editor ([`editor.md`](../.claude/skills/video-studio/roles/editor.md)) | capture, cut, captions, grade, encode | after the animatic and sound plan | a thread `Editor · <video>` | Sonnet |
| Motion ([`motion.md`](../.claude/skills/video-studio/roles/motion.md)) | titles, end cards, kinetic text | when the cut needs graphics | subagent of the Editor | Sonnet |
| Critic ([`critic.md`](../.claude/skills/video-studio/roles/critic.md)) | grades the animatic and the cut; made nothing it grades | on the animatic and on the cut | a fresh subagent of the Producer | Opus |

### Social (`social-team`)

Runs yskills' accounts; the loop and posting rules: [`social-team`](../.claude/skills/social-team/SKILL.md); the order from idea to numbers, with the Film roles in it: [`pipeline.md`](../.claude/skills/social-team/pipeline.md).

| Role and playbook | Job | Called when | Runs as | Model |
|---|---|---|---|---|
| Social Lead ([`lead.md`](../.claude/skills/social-team/roles/lead.md)) | what goes out, when and why: backlog, plan, posting, briefs to the studio | the weekly routine, "work them out", "upload" | the routine; a thread `Social · <brand> week <n>` | Sonnet; Opus writes the weekly plan |
| Scout ([`scout.md`](../.claude/skills/social-team/roles/scout.md)) | rising sounds, formats, hooks, competitors' best posts | the weekly routine, before a brief | subagent of the Lead | Haiku to read and watch; Sonnet to sum up |
| Community ([`community.md`](../.claude/skills/social-team/roles/community.md)) | comments and DMs, follower gifts, leads | each comment or DM, a daily review | the Worker's webhook plus a daily subagent | Sonnet |
| Partnerships ([`deals.md`](../.claude/skills/social-team/roles/deals.md)) | brand deals: media kit, outreach drafts, offers | a brand message, "find deals" | subagent; a thread `Deal · <brand> · <partner>` per real offer | Sonnet; Opus reads a contract |
| Hook Checker ([`hook-check.md`](../.claude/skills/social-team/roles/hook-check.md)) | gate on the hook before filming and on the cut's first seconds | after the script, and on the cut before the Critic | fresh subagent of the Lead | Sonnet |
| Caption Writer ([`copy.md`](../.claude/skills/social-team/roles/copy.md)) | description, hashtags, pinned question, cover text in his voice | on the final cut, before the Critic | subagent of the Lead | Sonnet |
| Publisher ([`publisher.md`](../.claude/skills/social-team/roles/publisher.md)) | preflight, scheduling, read-back, `posts.md` row | "upload", the switch, a project account | subagent of the Lead | Sonnet |
| Analyst ([`analyst.md`](../.claude/skills/social-team/roles/analyst.md)) | numbers per post at 24 h and 7 d, what to repeat or drop | the daily sweep (24 h and 7 d due), the weekly routine | subagent of the Lead | Sonnet |

### Story (`storyteller`)

The Story team (Director, Planner, Writers, Editor, Continuity, Narrative Designer, Copywriter,
Localiser) and its models: [`07-story-team.md`](../.claude/skills/storyteller/references/07-story-team.md).
Its Opus rows are the story's taste roles under the Opus rule; everything else follows the tiers here.

Merged on 2026-10-26, so nobody looks for them: Librarian (finding what exists is the Researcher's
step 2; keeping lessons is the gate's lessons step), a plan Critic (the grill and the stress test
attack the plan; the Tester grades the work), Architect as a role (the Planner owns architecture; the `architect` agent stays as its optional Fable helper on the laptop).

## Kits

One row per kind of task (Spawn rule 1: the task picks the row, the project's kind is only the
default). Read that row; load nothing else until a job names it. The team list is for size L; S and
M take the Sizes table.

| Kind | Read first | Team at size L, in order | Skipped | Steps |
|---|---|---|---|---|
| `site` | [`scaffold`](../.claude/skills/scaffold/SKILL.md), [`publish`](../.claude/skills/publish/SKILL.md), [`roles/designer.md`](../.claude/skills/operator/roles/designer.md), [`roles/content-designer.md`](../.claude/skills/operator/roles/content-designer.md), [`legal`](../.claude/skills/legal/SKILL.md), [`sell`](../.claude/skills/sell/SKILL.md) (money path), [`roles/analytics.md`](../.claude/skills/operator/roles/analytics.md), [`USING.md`](USING.md) | Planner, Researcher, Designer (Content Designer), Analytics, Programmer, Tester; Legal at launch | Game Designer, Audio, Playtester | 1 to 9 |
| `app` | the `site` files, [`security-review`](../.claude/skills/security-review/SKILL.md) | the `site` team plus Security | Game Designer, Audio, Playtester | 1 to 9 |
| `game` | [`game-pipeline.md`](game-pipeline.md) (only story games with renders), [`game-3d`](../.claude/skills/game-3d/SKILL.md), [`roles/designer.md`](../.claude/skills/operator/roles/designer.md) (Art direction first), [`roles/game-designer.md`](../.claude/skills/operator/roles/game-designer.md), [`roles/audio.md`](../.claude/skills/operator/roles/audio.md), [`roles/analytics.md`](../.claude/skills/operator/roles/analytics.md), [`roles/playtester.md`](../.claude/skills/operator/roles/playtester.md), [`store-publish`](../.claude/skills/store-publish/SKILL.md) (only Google Play; the CrazyGames checklist is `game-3d` section 5a) | Planner, Researcher, Game Designer (Audio), Designer, Analytics, Programmer, Playtester, Tester; Security (`red-team` on the last PR) and Legal at launch | Content Designer (unless the game has a lot of text), Marketer before the first playable | 1 to 9 |
| `video` | [`video-studio`](../.claude/skills/video-studio/SKILL.md), its [`learnings.md`](../.claude/skills/video-studio/learnings.md) and [`formats.md`](../.claude/skills/video-studio/formats.md), [`media-editing`](../.claude/skills/media-editing/SKILL.md) | Researcher, then the Film team | Programmer, scaffold, launch, grow | 1, 2, 9, then the `video-studio` pipeline |
| `social` | [`social-team`](../.claude/skills/social-team/SKILL.md), its [`learnings.md`](../.claude/skills/social-team/learnings.md), [`market`](../.claude/skills/market/SKILL.md) §4 and §6, [`watch`](../.claude/skills/watch/SKILL.md) (a video link) | the Social team; "work them out" starts the Social Lead | Programmer, scaffold, launch, Researcher (the Scout reads the niche) | 1, 9, then the `social-team` pipeline |
| `story` (Ren'Py) | [`renpy.md`](renpy.md), [`game-pipeline.md`](game-pipeline.md), [`two-figure-scenes.md`](two-figure-scenes.md), [`character-workflow.md`](character-workflow.md), [`storyteller`](../.claude/skills/storyteller/SKILL.md) | Planner, Researcher, Storyteller (`storyteller` skill), Designer for renders, Programmer for Ren'Py, Tester; Legal at release | Game Designer, Audio, Analytics, Security, Marketer | 1 to 7 and 9 |
| `setup` (claude-setup) | [`CLAUDE.md`](../CLAUDE.md), [`MAP.md`](MAP.md), this file, [`WORKFLOW.md`](WORKFLOW.md) | Planner (size M and L), Programmer, the gate with its Reviewer | Designer, Marketer, Legal, `sell`, launch, grow | 1 to 3 by size, 5, 6, 9 |
| `repo` (private, no Worker) | the row of the kind its content says; default `site` | that kind's team | that kind's list | that kind's steps |

A new site or app, even small, still gets the Designer pass before the build styles anything. A kind
not in the table is sized as `site`. Several ideas in one message become one chain each; chains that
share no file run at once, the rest queue in `PROGRESS.md`. The `Done:` line ends with one short
line per role saying what it found or checked.

## Models for tasks that are not a role

| Task | Model | Effort |
|---|---|---|
| Reading jobs (files, PRs, logs, one web page), `watch` on a video, CI polls | Haiku | low; prompt under 100k |
| Doc updates, status rows, lint fixes | Haiku | low |
| Handoff writing | Haiku or the thread itself | low; never a new Opus call |
| Figure and scene pipeline | Sonnet renders and crops; Opus diagnoses once | medium; Fable never |
| Video and media edits, store and deploy workflows | Sonnet | medium |
| Evaluator, variant comparison | Sonnet; Opus on L gates and any pick between variants | medium |

Fixed rules: effort medium is the default; high only where listed; max never unless yskills asks.
Never switch a running thread's model (the cache is rewritten once, about $1 at 110k). Haiku reading
jobs stay under 100k of prompt, because its price doubles above that. Thread starts pass the full
ids; `Agent` calls and agent files use the aliases `fable`, `opus`, `sonnet`, `haiku`.
`scripts/check.mjs` fails when a role playbook is missing from the roster or a row has no model.
