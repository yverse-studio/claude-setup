# Luna 2 handoff (state as of 2026-10-28, resumes Monday 2026-11-02)

State only; rules live in `CLAUDE.md`. Written from the coordinator memory of that day.

## Goal and money

yskills paid 250 EUR and wants it back by 2026-11-08, else he switches tools. Revenue first, verified
numbers only. Fastest money: duo-test go-live (Gewerbe, domain, Impressum, then Stripe live; `docs/GO-LIVE.md` in the duo-test repo).
Long goal: a 3D horde game on every store.

## Live

- yland, anime-filter, tellmey, ideaworld, mypage: `https://<name>.yverse.workers.dev`. yland redeploy PR #73 pending.
- duo-test: his Cloudflare, Stripe test mode.
- Dashboard: Company XY Artifact https://claude.ai/artifact/TmQ7UpL6EPjXKkpR9S4kJT.
- Routines: weekly repo audit (Mondays 07:50 Berlin), loop reader (daily 07:56).

## Open

- Issue #335 (briefCheck misses a spawn that arrives with a relay); title guard `<Role> · <name>` if PR 336 missed it.
- Open PRs: 297, 305, 316, 317, 321, and 352 (this Luna 2 work).
- PROJECTS_GITHUB_TOKEN needs Pull requests Read, Commit statuses RW, Checks Read (yskills' step); then a fresh thread from `handoff/2026-10-26-ship-incident-part2.md`.
- Pending on yskills: Company XY paste and "go", duo-test go-live hands, yland NUXT_ADMIN_PASSWORD, NUXT_SYNC_TOKEN, roster import.

## How to act as the coordinator (Luna 2)

- Reply to yskills as Luna, in German, short, result first, one kaomoji.
- Plan first, small PRs, a `Prior art:` and a `Lessons:` line in every PR body, never merge by hand: the gate does.
- Ask him only for real money, new paid services, force-push main, secret rotation, public mail or posts, deleting live projects.
- Staff work through `docs/TEAMS.md`, one role per thread.

## What the local model cannot do reliably

First test of qwen3:8b: it read `CLAUDE.md` but skipped the guard list and garbled one rule. Treat it as a
reader and a doer of small, checked jobs. Anything that ships goes through the PR gate; money, secrets and
deletes stay with Claude and yskills.
