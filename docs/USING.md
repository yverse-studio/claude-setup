# Using Claude as your project manager

One page, made for a phone. Every number has its source; "not measured yet" means nobody has.

## Start a project

Once per new claude.ai project, before the first message. The text is a short pointer: every
session, the project chat included, loads this repo with `add_repo` and follows its `CLAUDE.md`,
so the rules live here only.

1. Open [`operator/templates/project-instructions.md`](../.claude/skills/operator/templates/project-instructions.md)
   and copy everything below the `---` line.
2. In the project: **Project settings > Memory > Project instructions**, paste, replace `<app>`
   with one line on what the project is, save.
3. **Project settings > Repositories**: add `yverse-studio/claude-setup` (threads load the
   details from it).

A rule change needs no new paste: sessions read the rules from this repo.

## Start an app

Write **one message** in the Company XY project, as short as you like: what it is, who it is for,
and what you would charge, if anything. Or tap the notepad in HQ. That is all. You do not name
files, tools or models.

## What happens next

1. **Brainstorm.** Claude says what it would build instead, pushes back with reasons, then sends
   one batch of tap cards. Answer once.
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
with one recommended; work continues on it unless it is money, a new service or a deletion.

## Deploy a page in one shot

What you do: write the idea. A thread does the rest.

1. Pick the name: lowercase letters, digits, dashes. It is the repo and the Worker name.
2. Start it: push branch `new/<name>` **in one push, with the file in it** (git, or `push_files` to
   a new branch; `create_branch` then `create_or_update_file` is two pushes and the first, empty
   one makes a site), file `projects/<name>.json`:
   `{ "name": "<name>", "d1": true, "org": "yverse-studio" }`, plus `"kind": "game"` for a game.
   Or start `new-project.yml` in `yverse-studio/claude-setup`: GitHub MCP `actions_run_trigger`
   `run_workflow`, ref `main`, inputs `name`, `d1` (false when the page stores no data), `kind`
   (`site` or `game`).
3. Register it: the new repo's first PR (or a small PR in claude-setup) adds
   `projects/<name>.json` to `main`; the branch is deleted after the run, so nobody else does.
   Delete refuses names without it. A game's first PR replaces the day-zero stub; until it
   merges, the live URL shows the stub.
   Its CI fails a PR that changes UI, text or play before the docs exist (design, copy, tracking
   plan; game design and sound for a game); each failure names the fix (`publish` skill).
4. Wait for the run: `actions_list` `list_workflow_runs` ignores `per_page` and returns about
   20k tokens, so read it once, then `actions_get` `get_workflow_run` by id. Its summary has the
   repo, `https://<name>.yverse.workers.dev` and the first build's status.
5. `add_repo` the new repo, then build on branches: every branch gets a Preview, every merge to
   `main` goes live. Post the live link.

Detail and failures: `publish` skill (A new project). What the workflows cannot do (KV, wrangler,
dashboard-only settings) goes to a laptop session, never to you: `publish` skill (Two routes).

## Ship a game to Android and Google Play

What you do: say "ship <name> as APK" or "to the Play Store". Claude follows the `store-publish` skill:
the website gets a download button, a tag builds and signs the APK, and later releases go to Google Play
by workflow. You do the account steps it sends you, one at a time (Play account, service account,
testers). Every project adds its lessons to that skill.

## Share a video

What you do: in Instagram, TikTok or YouTube tap Share, then Copy link, and paste it into the project
chat with one line ("fact check", "should we use this?"). Send the link, not the file. A thread watches it
for free (frames plus transcript, `watch` skill) and answers with what it saw, what it heard, a fact check
and whether claude-setup should adopt it. Private or login-only posts don't work; send a screen recording.

## Social media

What you do: drop ideas, say two words, set one switch. The `social-team` skill runs the rest.

1. Any idea, any time, one line in the project chat: Claude files it and reacts 👍.
2. "work them out": the studio makes the videos; you get them in HQ's Content view.
3. Your personal account: "upload" sends them to your drafts or the schedule; you decide what goes
   up. Leaving for a while: switch auto-post on in HQ (build and learning videos only, never ads or
   crypto, at most 2 a day, a daily summary).
4. A project account (one per brand or project): you sign up and connect it once, about 5 minutes
   (`social-team` `templates/account-setup.md`); Claude decides and posts on it from then on.
5. Brand deals: Claude keeps the media kit and a partner list and drafts the offers; you get
   one line before any message to a brand, any price and any yes or signature.

## Delete a page

What you do: say "delete <name>". Deleting is the one step Claude asks for first.

1. Run `delete-project.yml` (`actions_run_trigger` `run_workflow`, ref `main`) with `name`,
   `confirm` = the name again, `dry_run` true. Read the plan in the log.
2. Run it again with `dry_run` false. It removes the Worker and its builds, D1 `<name>` and
   `<name>-preview`, the repo and a leftover `new/<name>` branch.
3. Remove `projects/<name>.json` from `main` in a small PR, and say it is gone.

It refuses protected names, names without `projects/<name>.json` on `main`, and repos the
workflow did not make. Detail: `publish` skill (Delete a project).

## When Claude asks you

Only for real money, mail or posts, deleting data, force-push, rotating a secret, a choice with
no clear default, design input, or a step only you can do. The full list: `CLAUDE.md` (How to
work). Everything else it just does and tells you.

You get a notification only when needed, plus big milestones.
Say "stop" or "pause" and everything stops; a look you reject stays rejected.

## What stays with you, and why

| Step | Why Claude can't |
|---|---|
| Delete a branch, re-run Actions, CLAUDE.md edits | Cloud threads get a 403 on branch deletes and Actions re-runs, and the safety check may refuse edits to policy files (CLAUDE.md, gate.md) and refuses secret reads; a PC session deletes branches; a refused policy edit needs your Allow in that thread |
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
| Hand-off | warns at 150k, hand off by 200k | `global/context-guard.mjs` |
| Hosting, all apps together | Cloudflare 0 to 4,35 €/month, even at 10,000 users | research note, 2026-10 (project files) |
| The daily loop check | no euros: one short turn on the plan | not measured in tokens yet |
| Example of waste | fanning out several threads before anything was visible cost about 10 € of tokens in test run 1 | operator `SKILL.md` |
| Cost per finished app | not measured yet | |

Keep it cheap: one app at a time, at most three working threads, ask for a first visible result
before more.
