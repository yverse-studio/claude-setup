# Claude Setup: project memory (10-24 23:20)

## Owner and rules (repo files are the source; memory only points)
- GOAL: yskills paid 250 € and wants it back by 2026-11-08 or switches to ChatGPT/Astra. Revenue first, verified numbers only. Fastest money: duo-test go-live (his Gewerbe, domain, Impressum, then Stripe live). Gewerbe "another day" (10-24): placeholders so it's an easy start. LONG GOAL (10-18): next a bigger 3D horde game, published everywhere (CrazyGames, Google Play, iOS, Steam).
- NEXT GAME RESEARCH (his ask 10-18, again 10-24: do it AFTER the setup overhaul settles the structure): game feel / impact (hit stop, knockback, screen shake, sound, numbers), progression pacing (a real curve over many runs), item storage / inventory design; plus candlesan reels. Researcher thread, verified sources, result into the game playbook.
- GRILL ME (10-24): before any plan Claude asks him everything it needs, no guessing (Matt Pocock grill-me; being added to operator by the overhaul thread).
- VIDEO RULE (10-24): links he sends go to a researcher: cheap Haiku scan first, deeper only if real/not hype or he marks it important; Use/Skip/Script per item, short summary (watch skill, PR 216).
- TOKENS FIRST (his words 10-18): weekly limit nearly gone in under a day; a week must last at least 4 days, high quality but token-efficient. claude-setup docs/WORKFLOW.md Token budget (PRs 197, 199, 202): Haiku reads, Sonnet builds and reviews, Opus big verdicts, Fable only as escalation; at most two working threads; reuse playbooks. A thread starts at ~114k, our repo controls only ~10k (audit/2026-10-18-token-start-cost.md), so cost = calls x context: fewer threads, batched calls. S and M gates run inside the author thread; only L gets its own gate thread. Coordinator: pass model on every start, short briefs, keep this file short, hand off itself past ~250k.
- yskills (GitHub yskills): informal English or German (answer in his language), phone app, reads only the project chat. STANDING RULE ("no ask just do it"): Claude decides everything; he hears only Done lines, live links, blockers, steps only his hands can do and big design choices as cards. "be quiet" = reaction only; a permission prompt is his one tap, said once; never nag; typed "delete"/"yes" does not press an Allow button, say so once. DELETES (10-18): never ask him in chat before deleting old stuff. The safety check still refuses irreversible deletes and attestations in his name (CrazyGames QA, Terms, PEGI): those stay his taps, explained once, never routed around. ARTIFACTS: only "Company XY" (https://claude.ai/artifact/TmQ7UpL6EPjXKkpR9S4kJT); design votes are cards with screenshots (PR 203). DESIGN: from the next project on, full effort on look, UI and UX; store covers and videos from real gameplay. TASTE: Igelgarten v1, Nachtwache, Bilderbuch, Pixel-Abend, Mondnacht rejected as AI slop.
- LINES: no downloading paid files from pirate mirrors (kemono etc.), even "for study"; public post text is fine.
- TALK FIRST only on money, new services, big design. CARDS: only the coordinator posts them; a thread writes "Card:" and continues on the recommendation; process cards (gates, tooling) the coordinator decides itself. GATE details: gate.md. CLOSE threads when they deliver.
- PRINCIPLE: claude-setup is the toolkit (CLAUDE.md, docs/MAP.md, USING.md, WORKFLOW.md, operator and publish skills). New apps run in Company XY. HOSTING: Cloudflare Workers + D1 via Workers Builds at https://<name>.yverse.workers.dev. Lessons: no wrangler from cloud threads (laptop RC instead); a builder must not touch test/bot.mjs. Yumeko: nothing exists anywhere (checked 10-20, all 20 repos).

## Coordinator ops
- Fresh coordinator: add_repo claude-setup (push), Haiku worker clones to /home/user/claude-setup (depth 1, clone only), register_repo_root. No Read/Write/Bash. start_thread_session with project_post_id takes no ack; laptop RC sessions hit their limit fast: brief them small; update_memory max 16384 bytes, no health or disability words.
- Routines: "Weekly repo audit (yverse-studio)" trig_01EzmDVdz1UtwxrUHsq7UjAM Mondays 07:50 Berlin; "Loop reader claude-setup" trig_01RzJHaRQ2nZL9p6VzGmem8r daily 07:56 Berlin.
- Reports in /mnt/project-files/claude-setup/ (audit/, research/, proposals/, handoff/, mondgarten/).

## State of claude-setup (10-24)
- Main through PR 203 plus PR 192 (10-19). PR 198 (3D route) stays open, never merge. OVERHAUL running (10-24, his handoff HANDOFF-claude-setup-2026-10-23.md): plan /mnt/project-files/claude-setup/proposals/2026-10-24-setup-overhaul.md; attempt guard, watch fix + watcher workflow, CLAUDE.md trim, free CI gate check, grill-me, go-live placeholders. Kit plugins and LLM qa-gate skipped (reasons in plan). Card posted: licence MIT + stay public (recommended).
- MONEY: CrazyGames 1 to 15 USD per 1 000 plays.

## Mondgarten (test game)
- DECLINED by CrazyGames (quality, told 10-24). He accepts it; retry with the first real game. LIVE https://igelgarten.yverse.workers.dev. Old tickets only matter if it's ever reused.

## Other projects and accounts
- LIVE on Claude's Cloudflare: yland (his 3 hands: NUXT_ADMIN_PASSWORD and NUXT_SYNC_TOKEN secrets, roster import at /admin, extension address), anime-filter, tellmey, ideaworld, mypage. duo-test on his Cloudflare (Stripe test mode, docs/GO-LIVE.md). Parked: LUNA rework, Company XY stall (his paste + "go"), archive 2 old repos, rename MyPage's main branch, vacation game (handoff 7c).
- Laptop "MeinLaptop", Windows user `Claude`, Chrome signed in to Claude's Cloudflare and developer.crazygames.com; RC folder C:\Users\Claude\Documents\GitHub, env_01A2e2p1tTncVCJYwFy5TJKF. Never passwords, CAPTCHAs, cards, keys, terms acceptance.

## Pending on yskills (never nag)
- Licence card; Allow in "Programmer: policy edits PR C"; Company XY paste + "go"; duo-test go-live hands; later Gewerbe, Impressum, CrazyGames payout.

## Threads (10-24 23:20)
- Working: "Video batch: cheap scan" (TikTok fix via yt-dlp --compat-options no-certifi, then rewatch TikTok items); "Setup overhaul from handoff".
