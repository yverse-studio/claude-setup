# Teams: who does what, in which thread, on which model

The one home of the teams, their roles, the new-idea workflow and the model per role (yskills
2026-10-26: threads played several roles in one thread, skipped the design workflow and ran on the
default model). Every session reads the Spawn rule below before it starts or asks for any thread;
the cloud setup script prints it at every session start (`global/team-brief.mjs`).

## Spawn rule

1. **One role, one thread.** A new idea or a change (a feature, art, a video, a new app, a new
   process in claude-setup) runs the [new-idea workflow](#new-idea-workflow): each of its roles is
   its own thread, titled `<Role> · <topic>` (`Planner · Ideen-Kalender`). A thread never plays a
   second role, not even "quickly". Only a plain bug fix, a small tweak or a question is one thread
   of the role it needs (usually `Programmer · fix <what>`).
2. **Only the coordinator starts threads** (`start_thread_session`). A thread that needs another
   role asks it with `message_coordinator` in one message: role, topic, model, the files to read,
   done-when. It never does that role's job itself while it waits.
3. **Every start names its model.** `start_thread_session` always passes `model`: the role's tier
   from the [team tables](#the-teams), as the id from the Models line below. The project default
   is never relied on (it was Opus on 2026-10-26, so every thread ran on Opus). Every `Agent`
   subagent passes `model` too: `haiku` for reading, listing, watching, polling; `sonnet` for
   building and reviewing; `opus` only for a judgement its row names.
4. **The brief** starts with the block in `operator/briefs.md` ("Every thread brief starts with"),
   names the role's playbook (the link in its row) and what the role before it handed over.
5. **Short checks inside a role** (a diff review, a file read, one web page) stay subagents of the
   thread that needs them, each with its own `model`; a row below says when a role runs as a
   subagent. A subagent is a separate agent with its own job, never the owner wearing a second hat.

Models: best fitting model per task, cheapest that fits. Fable (claude-fable-5-1) is rare, drawn from yskills' Max plan: only the architecture or plan of a new product, a problem still stuck after a Sonnet round and an Opus checkpoint, or what yskills names; plus the project chat (coordinator), which yskills sets by hand; if Fable is out of credits or unavailable, Opus takes it without asking. Opus (claude-opus-5-5) for plans, design, judgement and full audits. Sonnet (claude-sonnet-5-5) for gates, fixes, research and builds. Haiku (claude-haiku-5-5) for a simple reading job, a lookup, a watch, a CI poll. Cheap first: Sonnet does the work and calls an Opus subagent before committing to an approach, when stuck twice on the same spot and before saying done; the gate's verdict is Opus on size L only, never on S or M. A thread never picks Fable itself, and routing, reviews, research, builds and fixes stay off it unless the brief names it (Budget). Effort medium unless yskills asks for more. When a newer model ships, use the newest of each tier. A model yskills names is used as named.

## New-idea workflow

The order for a new idea or change. Each step is its own thread unless its row says subagent;
each hands its output file to the next. The coordinator (Project Manager) starts every thread,
posts one line per finished step in the project chat and links every card.

| # | Thread | Does | Hands over | Skipped when |
|---|---|---|---|---|
| 1 | `Librarian · <topic>` (find) | searches claude-setup, every repo and branch, project files and memory for what already exists (skill, template, asset, research, a half-built branch) | `EXISTING.md`: what to reuse, with paths | never; a hit can end the workflow ("already exists, here it is") |
| 2 | `Researcher · <topic>` | best practice and state of the art, competitors, tools, proof people pay | `research/RESEARCH.md` | a fix or tweak; what step 1 found already answers it |
| 3 | `Planner · <topic>` | the grill round as cards (`operator` SKILL.md, Grill first), the stress test, the plan with acceptance criteria and slices | `PLAN.md`, `features.json` | a fix or tweak |
| 4 | `Critic · <topic>` (plan) | attacks the plan as a customer, a competitor, an investor and as yskills ("would he love it?"); pass, or back to the Planner once with the reasons | `critic.md` verdict | a fix or tweak |
| 5 | `Designer · <topic>` (and the kit's other design roles) | art direction, 2-3 drafts as screenshots, the vote card; then Content Designer, Game Designer, Audio, Analytics as the kit lists | `design/DESIGN.md`, vote screenshots, `COPY.md` and the others | nothing a user sees changes |
| 6 | `Programmer · <slice>` | one PR per slice with tests, preview link, screenshots | the PR, green CI | never |
| 7 | the gate | `operator/gate.md`: S and M in the Programmer's thread, L in a fresh `Tester · PR <n>`; Reviewer and Security as subagents | 5/5 table, merge | never |
| 8 | `Librarian · <topic>` (keep) | every lesson and reusable part (guide, template, asset, method) into its home in claude-setup, linked from `docs/MAP.md` | a small claude-setup PR | never; "nothing new" is said in one line |

The kind of project decides which design and build roles start (`docs/MAP.md`, Kits). A video or
social idea runs steps 1 and 8 around its own team below (the Social Lead and the studio take steps
2 to 7). A new app runs the kit's team in full, with steps 1 and 8 around it.

## The teams

Model is the tier; the id is in the Models line above. Effort is medium unless a row says more.

### Company (every project)

| Role and playbook | Focus and tasks | In → out | Hands to | Runs as | Model |
|---|---|---|---|---|---|
| Project Manager ([`project-manager.md`](../.claude/skills/operator/roles/project-manager.md)) | the coordinator: talks to yskills, starts every thread with its model, keeps `PROGRESS.md`, HQ rows, the asks ledger; never builds | yskills' message → threads, `Done:` lines | every role | the project chat | as yskills sets it |
| Librarian ([`librarian.md`](../.claude/skills/operator/roles/librarian.md)) | memory of the company: finds what exists before work starts, files what was learned after | the idea, the repos → `EXISTING.md`; lessons → claude-setup PR | Researcher; at the end the coordinator | a thread per idea, find and keep | Haiku (find), Sonnet (keep) |
| Researcher ([`researcher.md`](../.claude/skills/operator/roles/researcher.md)) | what the best do and what it costs: competitors, prices, tools, proof people pay | `EXISTING.md` → `RESEARCH.md` | Planner | a thread; one-page subagents inside | Sonnet; Opus to weigh conflicting findings |
| Planner ([`planner.md`](../.claude/skills/operator/roles/planner.md)) | turns idea and research into a plan: grill cards, stress test, slices, criteria | `RESEARCH.md`, yskills' answers → `PLAN.md`, `features.json` | Critic, then design roles | a thread | Opus; Fable for a new product's architecture or a plan rejected twice |
| Critic ([`critic.md`](../.claude/skills/operator/roles/critic.md)) | the hostile reader of a plan or concept; never wrote what it grades | `PLAN.md` → pass or reasons | Planner (fail) or design roles (pass) | a fresh thread | Opus |
| Legal ([`legal.md`](../.claude/skills/operator/roles/legal.md)) | German law must-haves, then pass/fail on the preview | the plan, the preview → must-haves, verdict | Planner, gate | subagent; a thread to write legal texts | Sonnet; Opus for a contract |
| Security ([`security.md`](../.claude/skills/operator/roles/security.md)) | the diff and the preview attacked like an outsider | diff, preview → findings | Programmer | subagents of the gate | Sonnet, effort high on money, auth, secrets; Opus on a disputed finding |
| Marketer ([`marketer.md`](../.claude/skills/operator/roles/marketer.md)) | the probe, launch posts, paid ads, weekly growth | live link → posts, numbers | coordinator | a thread at launch, then the weekly routine | Sonnet |

### Website, app and game (the build team)

| Role and playbook | Focus and tasks | In → out | Hands to | Runs as | Model |
|---|---|---|---|---|---|
| Designer ([`designer.md`](../.claude/skills/operator/roles/designer.md)) | the look before any screen: references, palette, type, 2-3 drafts, vote card; reviews every UI PR | `PLAN.md` → `DESIGN.md`, screenshots | Content Designer, Programmer | a thread; `design-critic` subagent per UI PR | Opus |
| Content Designer ([`content-designer.md`](../.claude/skills/operator/roles/content-designer.md)) | every word a user reads, German and English | `DESIGN.md` → `COPY.md`, strings | Programmer | a thread at start; subagent for one flow | Sonnet |
| Game Designer ([`game-designer.md`](../.claude/skills/operator/roles/game-designer.md)) | how a game plays: core loop, run length, difficulty, ad hooks | research → `GDD.md` | Designer, Audio | a thread | Opus |
| Audio ([`audio.md`](../.claude/skills/operator/roles/audio.md)) | how a game sounds, licence-clean and small | `GDD.md` → `AUDIO.md` | Programmer | a thread | Sonnet |
| Analytics ([`analytics.md`](../.claude/skills/operator/roles/analytics.md)) | what is measured and why, the weekly numbers line | `PLAN.md` → `TRACKING.md` | Programmer | a thread at start; subagent for one action | Sonnet |
| Programmer ([`programmer.md`](../.claude/skills/operator/roles/programmer.md)) | one slice or fix as one PR, tests first, green CI | `features.json` slice → PR | the gate | a thread per slice, never more than three at once | Sonnet; Opus subagent before committing to an approach, when stuck twice, before "done" |
| Playtester ([`playtester.md`](../.claude/skills/operator/roles/playtester.md)) | plays a game build like a stranger | preview → playtest report | the gate | a fresh thread per play-changing build | Sonnet |
| Tester ([`tester.md`](../.claude/skills/operator/roles/tester.md)) | the gate: grades the preview against the criteria; never built it | PR, criteria → 5/5 table, merge | coordinator | S, M: the author thread; L: a fresh thread | Sonnet; Opus verdict on L only |
| Reviewer ([`reviewer.md`](../.claude/skills/operator/roles/reviewer.md)) | reads the diff for bugs, mess, missing tests | diff → findings | Programmer | subagent of the gate | Sonnet |

### Film (`video-studio`)

Starts when yskills, the Social Lead or the Marketer asks for a video or ad. The pipeline and its
Critic gate: [`video-studio`](../.claude/skills/video-studio/SKILL.md).

| Role and playbook | Focus and tasks | In → out | Hands to | Runs as | Model |
|---|---|---|---|---|---|
| Producer ([`producer.md`](../.claude/skills/video-studio/roles/producer.md)) | owns one video: brief, concept card, delivery | the ask → `BRIEF.md`, `final.mp4` | Writer, then the Social Lead | a thread `Producer · <video>` | Sonnet; Opus picks the concept |
| Writer ([`writer.md`](../.claude/skills/video-studio/roles/writer.md)) | three concepts, hooks, script, captions | `BRIEF.md` → `script.md`, `references.md` | Director | subagent of the Producer; a thread for an ad batch | Sonnet |
| Director ([`director.md`](../.claude/skills/video-studio/roles/director.md)) | shots, storyboard, animatic | script → `storyboard.md`, `animatic.mp4` | Critic, Sound | subagent of the Producer | Sonnet |
| Sound ([`sound.md`](../.claude/skills/video-studio/roles/sound.md)) | music bed, beat map, SFX, mix, masters | storyboard → `sound.md`, mix | Editor | subagent of the Producer | Sonnet |
| Editor ([`editor.md`](../.claude/skills/video-studio/roles/editor.md)) | capture, cut, captions, grade, encode | animatic, `sound.md` → `draft.mp4` | Motion, Critic | a thread `Editor · <video>` | Sonnet |
| Motion ([`motion.md`](../.claude/skills/video-studio/roles/motion.md)) | titles, end cards, kinetic text, overlays | the cut → overlays | Editor | subagent of the Editor; a thread for a template set | Sonnet |
| Critic ([`critic.md`](../.claude/skills/video-studio/roles/critic.md)) | the harsh first viewer; yskills never sees a failed video | animatic, cut → `critic.md` | Producer | a fresh thread `Critic · <video>` | Opus |

### Social (`social-team`)

Runs yskills' accounts; his "work them out" and "upload" drive it. The loop and posting rules:
[`social-team`](../.claude/skills/social-team/SKILL.md).

| Role and playbook | Focus and tasks | In → out | Hands to | Runs as | Model |
|---|---|---|---|---|---|
| Social Lead ([`lead.md`](../.claude/skills/social-team/roles/lead.md)) | what goes out, when and why: backlog, plan, posting, briefs to the studio | ideas → briefs, schedule | Producer, Analyst | the daily and weekly routine; a thread `Social · <brand> week <n>` | Sonnet; Opus writes the weekly plan and ranks ideas |
| Scout ([`scout.md`](../.claude/skills/social-team/roles/scout.md)) | rising sounds, formats, hooks, competitors' best posts | the niche → hook library | Social Lead | subagent of the Lead | Haiku to read and watch; Sonnet to sum up |
| Community ([`community.md`](../.claude/skills/social-team/roles/community.md)) | comments and DMs, follower gifts, leads | comments → reply drafts | Social Lead, Partnerships | the Worker's webhook plus a daily subagent | Sonnet |
| Partnerships ([`deals.md`](../.claude/skills/social-team/roles/deals.md)) | brand deals: media kit, outreach drafts, offers | a brand message → drafts for yskills | Legal, yskills | subagent; a thread `Deal · <brand> · <partner>` per real offer | Sonnet; Opus reads a contract |
| Analyst ([`analyst.md`](../.claude/skills/social-team/roles/analyst.md)) | numbers per post, what to repeat or drop | analytics → lessons | Social Lead | subagent in the weekly routine | Sonnet |

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
ids; agent files use the aliases `fable`, `opus`, `sonnet`, `haiku` (a `fable` agent falls back to
Opus by the Models line); built-in subagents get Sonnet through `CLAUDE_CODE_SUBAGENT_MODEL`
(`cloud/setup.sh`). Every other file points here. `scripts/check.mjs` fails when a role playbook
is missing from these tables or a row has no model.
