Rules live in yverse-studio/claude-setup (`CLAUDE.md`, `docs/MAP.md` Start here). Nothing in this file is a rule. Old memory and where each line went: `docs/archive/claude-setup-memory-2026-10-25/` (MOVES.md).

## Goal

yskills paid 250 EUR and wants it back by 2026-11-08, else he switches tools. Revenue first, verified numbers only; fastest money is duo-test go-live (his Gewerbe, domain, Impressum, then Stripe live; Gewerbe "another day", placeholders until then). Long goal (2026-10-18): a bigger 3D horde game on every store (CrazyGames, Google Play, iOS, Steam). 2026-10-26: setup perfect+tested first, then money.

## Live

- yland, anime-filter, tellmey, ideaworld, mypage: Claude's Cloudflare, https://<name>.yverse.workers.dev. yland's NUXT_ADMIN_PASSWORD, NUXT_SYNC_TOKEN and roster import are his hands.
- duo-test: his Cloudflare, Stripe test mode, `docs/GO-LIVE.md` in its repo. Legal pages locked until business.ts is complete; mail caps settled, don't churn.
- Mondgarten (igelgarten.yverse.workers.dev): declined by CrazyGames 2026-10-24 for quality; retry with the first real game.
- Dashboard: Company XY Artifact https://claude.ai/artifact/TmQ7UpL6EPjXKkpR9S4kJT (the only Artifact).
- Routines: "Weekly repo audit (yverse-studio)" Mondays 07:50 Berlin; "Loop reader claude-setup" daily 07:56 Berlin.
- Reports: /mnt/project-files/claude-setup/ (audit/, research/, proposals/, handoff/; zip of 2026-10-25 in archive/).
- Style library: .claude/skills/ui-review/styles/ (PR 258). Clipping check: scripts/clipping.mjs (PR 282).
- Model guard hook live in cloud since env rebuild 2026-10-26 15:25 (cloud env only rebuilds on Setup script edit, host change, or ~7 days).
- Deploy watcher every 15 min (PR 289, GitHub Actions, no Claude tokens; yskills OK'd 15 min). Journey gate for UI PRs (PR 290). Live commit endpoints: tellmey, ideaworld, mypage, anime-filter; yland redeploy PR #73 pending.

- Laptop ~/claude-setup: main at PR 230, installed 2026-10-25; a stash holds an unsaved pc-claude-user.md edit.

## Coordinator (tested 2026-10-26)

- Always pass `model` on start_thread; Agent calls need model too. Repo agent types don't load in cloud: general-purpose + model + "act as .claude/agents/<name>.md". Briefs start with Role · Kit · Size (TEAMS.md). S gates run in the working thread; M/L get a fresh Tester thread. Close every thread right after Done.
- yskills wants NO GitHub mails: PRs must not assign or request review from yskills (2026-10-26).

## Pending on yskills

- BLOCKER: PROJECTS_GITHUB_TOKEN (yskills-claude fine-grained) needs Pull requests Read, Commit statuses RW, Checks Read; asked 17:06. On "token done": fresh thread from handoff/2026-10-26-ship-incident-part2.md reruns journey on anime-filter#5, checks yland fe51233 live.
- Re-paste boot texts (PR 285) into Claude Setup, Social Media Manager, Company XY, game project: /mnt/project-files/claude-setup/boot-text/. Claude Setup: coordinator may do it on "mach du".
- Preview-login card in thread "Stop broken app work reaching live".
- Ollama on laptop, then "Ollama läuft" in "Plan free models like Qwen in workflow".
- Company XY paste + "go"; duo-test go-live hands; later CrazyGames payout.

## Threads

- Plan-first PR 261: gate thread stalled, pinged 15:24.
- Next game research: start after setup settles.
- Plugin wrapper per kit for the laptop: issue claude-setup#231.
- DeepSeek: test later. TikTok comments: issue #242. AI TikTok live: "Later".

## Products

- yverse-studio/claude-setup: the toolkit; lessons in the skill or role file (`docs/MAP.md` Lessons homes).
- Live product repos above: lessons in each repo's `docs/LESSONS.md`.
- Parked: LUNA rework, archive 2 old repos, rename MyPage's main branch, vacation game, POV magic test.

---
Under 3 KB. The coordinator rewrites it at milestones. Threads only add or change their own
Threads line. A rule found here becomes a `loop:setup` issue (`docs/MAP.md`, Start here).