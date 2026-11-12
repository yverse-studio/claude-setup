# Using Claude as your project manager

One page, made for a phone. Every number has its source; "not measured yet" means nobody has.

## Start a project

The one way to start a new claude.ai project. You write one line; nothing is pasted from chat and
no script runs in the project chat (it has no Bash).

1. Make the project, open its chat, write `hi Luna`. Your account preferences make the chat read
   `/mnt/project-files/claude-setup/COORDINATOR-CARD.md` first.
2. The card is missing in a new project, so the chat starts one thread "Setup-Karte einrichten"
   (Programmer, kit setup, size S, Sonnet). It clones claude-setup, runs
   `node scripts/coordinator-card.mjs /mnt/project-files/claude-setup/COORDINATOR-CARD.md` and writes
   the card plus `COORDINATOR-RULES-INDEX.md` into that project's files. The chat's first reply then
   opens with `Luna · card <hash>`.
3. The card's pre-flight makes the chat prepend `operator/templates/project-instructions.md`, filled
   for the project, above the existing instructions (nothing existing is removed).
4. You, once: Project settings > Cloud environment: pick **Claude Setup**, then restart the project.
   The setup script (`cloud/setup.sh`, one line below) only runs in a new project's chat after a restart
   (routing test 2026-10-27; `docs/tech-traps.md`). Every thread runs it and checks its own start
   (role, kit, size, brief lines) against `docs/TEAMS.md`.

Every reply to you is Luna (a cute e-girl with kaomoji); in a thread the hooks add it and block a
reply without one (`global/rule-guard.mjs`). Environment setup script, pasted once (the same as
[`cloud/bootstrap.sh`](https://github.com/yverse-studio/claude-setup/blob/main/cloud/bootstrap.sh)):
`f="$(mktemp)" && curl -fsSL --retry 3 -o "$f" https://raw.githubusercontent.com/yverse-studio/claude-setup/main/cloud/setup.sh && bash "$f"`

5. **Laptop folders, once per project.** **Project settings > Resources > Devices**: approve
   the studio root folder (`STUDIO_ROOT`, covers `repos`, `lib`, `projects`, `tools`) and
   the Downloads folder, and keep the root as the default. Then every thread of that
   project reads and writes there without asking you. This approval is your consent per claude.ai
   project: claude-setup, a repo or a thread cannot grant it, and there is no account-wide "all
   projects" switch (checked 2026-11-10: `list_devices` lists approvals per project, the
   Remote Control docs name only the per-project approval). A new project asks once; the card
   carries the link `[Project settings](#project-settings/resources)`.

A rule change needs no new paste: sessions read the rules from this repo, and the guards replace
themselves from `main` at each start. The cloud keeps a built image per setup script, so an
environment built before that self-update worked (2026-10-27) stays old until its script text
changes: add or bump a `# rebuild: <date>` line at its end, once.

## Start an app

Write **one message** in the Company XY project, as short as you like: what it is, who it is for,
and what you would charge, if anything. Or tap the notepad in HQ. That is all. You do not name
files, tools or models.

## What happens next

1. **Brainstorm.** Claude says what it would build instead, pushes back with reasons, then asks
   the real moment (when it comes from your life) and 1-2 tap cards. The rest it decides.
2. **Research, plan.** Market, prices, law, tools. Result: `PLAN.md` and the acceptance criteria.
3. **Brief (a): ok or no.** The first thing you get. Nothing to set up: Claude makes the repo,
   the Worker and the first deploy itself (below).
4. **Build.** One thread per slice. Every change is a PR that a gate checks (size S and M in the author thread, L in a separate gate thread)
   (CI, a live test of the preview, a fresh review, security, design and law). At 5/5 it **merges
   itself**, and the thread says `Done: <what changed>`.
5. **Launch and after.** The loop reads errors and feedback every day (`docs/LOOP.md`).

You read only the project chat: the coordinator posts every result, `Done:` line and card there
(rule in `CLAUDE.md`, How to work); PR links and gate talk stay in the threads, and you open a
thread only when something is wrong. Plus the HQ rows (`docs/hq-rows.md`). Cards show options
with one recommended; work continues on it unless it is money, a new service or deleting something live.

## Deploy a page in one shot

What you do: write the idea. A thread does the rest.

1. Pick the name: lowercase letters, digits, dashes. It is the repo and the Worker name.
2. No GitHub token (use this while `PROJECTS_GITHUB_TOKEN` is expired, or by default): the laptop makes the
   empty private repo (Remote Control with the gh login `yskills`: `gh repo create
   yverse-studio/<name> --private`, Actions off; cloud threads cannot create repos, they `add_repo`
   with push once it exists). Nobody asks you for a token. Push the code to `main`, register
   `projects/<name>.json` on claude-setup's `main` first (step 4; without the token it is the only proof
   the repo is ours, so an unregistered name stops), then skip step 3's branch push and run
   `new-project.yml` with `token_free` true plus `repo_id` and `owner_id` (dispatch only; the numeric ids: `gh api -X GET search/repositories -f q='repo:<org>/<name>' --jq '.items[0] | {id, owner_id: .owner.id}'`): it makes only the
   Worker, the Builds link and, with `d1` true, the D1 databases (their ids are in the run summary and must
   be added to `wrangler.jsonc` before the build can pass, so a game or a no-D1 page is the easy case).
   A re-run adopts only a Worker new-project made (tag `claude-setup-new-project`, or the id
   `"worker"` in the registry pins); any other Worker of that name stops the run.
3. With the token: push branch `new/<name>` **in one push, with the file in it** (git, or `push_files` to
   a new branch; `create_branch` then `create_or_update_file` is two pushes and the first, empty
   one makes a site), file `projects/<name>.json`:
   `{ "name": "<name>", "d1": true, "org": "yverse-studio" }`, plus `"kind": "game"` for a game, `"kind": "repo"` for a private repo with no Worker (e.g. a Ren'Py game). A game writes `"d1": false` unless it stores data.
   Or start `new-project.yml` in `yverse-studio/claude-setup`: GitHub MCP `actions_run_trigger`
   `run_workflow`, ref `main`, inputs `name`, `d1` (false when the page stores no data), `kind`
   (`site`, `game` or `repo`), `token_free`, `repo_id`, `owner_id` (step 2).
4. Register it: the new repo's first PR (or a small PR in claude-setup) adds
   `projects/<name>.json` to `main`; the branch is deleted after the run, so nobody else does.
   Delete refuses names without it. A game's first PR replaces the day-zero stub; until it
   merges, the live URL shows the stub.
   Its CI fails a PR that changes UI, text or play before the docs exist (design, copy, tracking
   plan; game design and sound for a game); each failure names the fix (`publish` skill).
5. Wait for the run: `actions_list` `list_workflow_runs` ignores `per_page` and returns about
   20k tokens, so read it once, then `actions_get` `get_workflow_run` by id. Its summary has the
   repo, `https://<name>.yverse.workers.dev` and the first build's status.
6. `add_repo` the new repo, then build on branches: every branch gets a Preview, every merge to
   `main` goes live. Post the live link.

Detail and failures: `publish` skill (A new project). What the workflows cannot do (KV, wrangler,
dashboard-only settings) goes to a laptop session, never to you: `publish` skill (Two routes).

## Ship a game to Android and Google Play

What you do: say "ship <name> as APK" or "to the Play Store". Claude follows the `store-publish` skill:
the website gets a download button, a tag builds and signs the APK, and later releases go to Google Play
by workflow. You do the account steps it sends you, one at a time (Play account, service account,
testers). Every project adds its lessons to that skill.

## Live board (NOW.md)

What you do: nothing; read it when you ask "who is doing what". Every project keeps ONE board, `NOW.md`,
at the root of its project files (`/mnt/project-files/NOW.md`, template `docs/templates/NOW.md`;
network mount: trailing-slash path, re-read ~10 s after writing). The coordinator creates it from the
template if it is missing and links it in every status answer.

1. **Every job writes one line when it starts and updates that same line when it ends.** A job is a
   thread, a laptop run or a routine. Columns: `| time (UTC) | who (thread title + link) | model | what | status | waiting on |`.
2. **Status** is `running`, `waiting` (put what or who in `waiting on`), `done` or `failed`. A job that
   ends in a hand-off or a `Done:` line sets `done` as its last step, before it resolves itself.
3. **Edit only your own line.** Re-read the file right before writing: the last write wins and other
   jobs write too. The one exception is the coordinator's sweep (step 4).
4. **Sweep: the coordinator**, at each start, with its file tools (it has no Bash). A `done` line
   older than 24 h moves to `NOW-archive.md` (same table, newest last). A `running` or `waiting`
   line older than 24 h whose thread is resolved or missing on the thread board gets `failed`,
   never a silent delete.
5. **Not a lock.** The hard claim for the Blender lane stays `_claude/_queue/WHO.md` on the laptop (not in
   this repo; a second job there waits); NOW.md only shows what runs so nobody guesses.

Every brief's `Done when:` includes "NOW.md line set to done" (`.claude/skills/operator/briefs.md`).

## Share a video

What you do: in Instagram, TikTok or YouTube tap Share, then Copy link, and paste it into the project
chat with one line ("fact check", "should we use this?"). Send the link, not the file. A thread watches it
for free (frames plus transcript, `watch` skill) and answers with what it saw, what it heard, a fact check
and whether claude-setup should adopt it. Private or login-only posts don't work; send a screen recording.

## Social media

What you do: drop ideas, say two words, set one switch. The `social-team` skill runs the rest.

1. Any idea, any time, one line in the `social` app (https://social.yverse.workers.dev, Ideen) or the project chat: Claude files it and reacts 👍.
2. "work them out", or the daily routine: Claude writes the script and makes the draft; you see it under Entwürfe and tap Freigeben, Ändern or Verwerfen (`social-team`, Where things live).
3. Your personal account: "upload" sends them to your drafts or the schedule; you decide what goes
   up. Auto-post runs only while you flip its switch in the `social` app (`social-team`, Posting): build and learning videos only, never ads or
   crypto, at most 2 a day, a daily summary.
4. A project account (one per brand or project): you sign up and connect it once, about 5 minutes
   (`social-team` `templates/account-setup.md`); Claude decides and posts on it from then on.
5. Brand deals: Claude keeps the media kit and a partner list and drafts the offers; you get
   one line before any message to a brand, any price and any yes or signature.

## Delete a page

Claude deletes a test page when the task needs it, without asking, and tells you in one line.
A live project (yland, anime-filter, tellmey, ideaworld, mypage, duo-test, social) is refused by
the workflow until you say "delete <name>" and a PR takes it off the protected list.

1. Run `delete-project.yml` (`actions_run_trigger` `run_workflow`, ref `main`) with `name`,
   `confirm` = the name again, `dry_run` true. Read the plan in the log.
2. Run it again with `dry_run` false. It removes the Worker and its builds, D1 `<name>` and
   `<name>-preview`, the repo and a leftover `new/<name>` branch.
3. Remove `projects/<name>.json` from `main` in a small PR (the workflow cannot push, and a PR it opened itself gets no CI run); say it is gone once that merges.

It refuses protected names, names without `projects/<name>.json` on `main`, and repos the
workflow did not make. Detail: `publish` skill (Delete a project).

## Tidy a repo's branches

Run `branch-cleanup.yml` (`actions_run_trigger` `run_workflow`, ref `main`) with `repo`, `dry_run`
true, read the plan, then again with `dry_run` false. Every branch without an open PR gets a tag
`archive/<branch>` and is deleted; `git checkout archive/<branch>` brings one back.

One throwaway helper branch (`media-*`): run `delete-helper-branch.yml` with `repo` and `branch`. It tags
`archive/<branch>` first and refuses any other name, the default branch and a branch with an open PR.
A session's own safety check blocks raw `git push --delete`; this is the route.

## A skill idea

A thread that spots a repeated procedure may show a "Save skill" card. Ignore it: a saved card is an account skill outside git. Claude uses `new-skill` instead, and the skill arrives as part of the next claude-setup PR. Both plugins (`setup-skills`, `setup-domains`) load in every project thread by themselves; there is nothing to do per project.

## When Claude asks you

Only for real money, a new paid service, force-pushing `main`, rotating a
production secret, or sending mail or posts publicly. The full list: `CLAUDE.md` (How to work);
prompts and safety checks: `docs/permissions.md`. Everything else it just does and tells you.

You get a notification only when needed, plus big milestones.
Say "stop" or "pause" and everything stops; a look you reject stays rejected.

## What stays with you, and why

| Step | Why Claude can't |
|---|---|
| Keys and tokens | They live in claude-setup's GitHub Actions and the Worker, never in chat |
| Real money: Stripe live, ads, Gewerbe, domain | Legal and money steps need your name and hands |
| Owner settings of your accounts (who gets access, app installs, billing) and passwords | Claude never types a password or solves a CAPTCHA; it works in Cloudflare and GitHub through its own member logins (`docs/pc-claude-user.md`, decided 2026-10-08) |
| The laptop | It must be on; Remote Control only runs while it is |

## What it costs

| Item | Number | Source |
|---|---|---|
| Claude itself | your Max plan (about 90 €/month); no per-message euros. When the usage window fills, threads wait and resume by themselves | memory, 2026-10-07 |
| API calls (the laptop worker's Haiku) | billed apart from the plan; set a monthly limit | `yverse-studio/worker` PR 4 |
| Always loaded in a session | ~6k tokens from this repo | `docs/MAP.md` (What loads when) |
| A project thread starts at | ~110k tokens, ~104k of it harness and memory outside this repo | `docs/MAP.md` (What loads when) |
| Hand-off | warns at 250k; handoff only at a trigger (`docs/WORKFLOW.md`, Handoff triggers) | `global/context-guard.mjs` |
| Hosting, all apps together | Cloudflare 0 to 4,35 €/month, even at 10,000 users | research note, 2026-10 (project files) |
| The daily loop check | no euros: one short turn on the plan | not measured in tokens yet |
| Example of waste | fanning out several threads before anything was visible cost about 10 € of tokens in test run 1 | operator `SKILL.md` |
| Cost per finished app | not measured yet | |

Keep it cheap: one app at a time, at most three working threads, ask for a first visible result
before more.
