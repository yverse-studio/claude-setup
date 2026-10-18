---
name: social-team
description: "Run yskills' brand accounts like a social media team: Social Lead, Scout, Community and Analyst turn ideas and the studio's videos into scheduled posts, replies and weekly numbers. Use for posting, comments, DMs, the idea backlog, account setup or a social media plan."
---

# Social team

yskills, 2026-10-12: "be my social media manager", "a real working company start up that generates
money". The `video-studio` team makes each video; this team decides what gets made, where and when
it goes out, answers the people who react, and measures what earns. Every post has a money job:
follow, profile tap, visit, install, sign-up or sale. Checked 2026-10-17; sources in
[`docs/research/2026-10-17-social-team.md`](../../../docs/research/2026-10-17-social-team.md).

Every role reads [`learnings.md`](learnings.md) first.

## yskills' loop

| yskills says | The team does | Status |
|---|---|---|
| any idea, any time, one line | the Lead files it in `social/ideas.md` (date, brand, pillar, format) and reacts with 👍, nothing else | idea |
| "work them out" (all, named, or "the best N") | the Lead ranks, writes a brief, the studio's Producer makes it (`video-studio`), the Critic passes it | ready |
| "upload" (all ready, or named) | the Lead sends it to the account's drafts or schedule (Posting below) | posted |

Also: "show my ideas", "drop X", "change X". Questions and results go to the coordinator, which asks
yskills in the project chat (CLAUDE.md, Cards); yskills does not read threads.

## Roles

| Role | Does | Playbook | Runs as |
|---|---|---|---|
| Social Lead | owns a brand's channels: backlog, weekly plan, calendar, posting, profile, account setup; briefs the studio | [`roles/lead.md`](roles/lead.md) | the weekly routine (fresh session) and a thread `Social · <brand> week <n>` |
| Scout | trends, rising sounds, competitors' best posts, the hook library | [`roles/scout.md`](roles/scout.md) | subagent of the Lead |
| Community | comments and DMs: reply drafts, comment-to-DM flows, follower-only gifts, leads | [`roles/community.md`](roles/community.md) | the `social` Worker's webhook plus a daily subagent review |
| Analyst | numbers per post, what to repeat or drop, new lessons | [`roles/analyst.md`](roles/analyst.md) | subagent of the Lead in the weekly routine |

Paid ads stay with the Marketer (`operator/roles/marketer.md`); the studio makes their creatives.
Thread titles follow the operator rule; models per the Models line in
[`docs/WORKFLOW.md`](../../../docs/WORKFLOW.md) (planning and judgement Opus, the rest Sonnet).

## Where things live

To build (not made yet): one project `social` (made by the `new-project` workflow, `docs/USING.md`) holds every brand: the
`social/` folder (`ideas.md`, `calendar.md`, `posts.md` with each post's numbers, `brands.md`),
the webhook Worker for comments and DMs, D1 for the queue, and the API behind HQ's Content view
(player, caption, Post / Change / Drop, the auto-post switch, the schedule). Videos stay in the
product project's `video/<slug>/` (`video-studio`).

## Posting

- **Default:** a ready video goes to the account's drafts or queue; yskills posts on "upload", or
  adds a trending sound and taps post in the app (organic posts ship with a silent track).
- **Auto-post:** only while yskills has switched it on in HQ. The switch is yskills' standing ok
  for posts under CLAUDE.md's ask rule ("sending mail or posts"); note the date in project memory. Then only videos the Critic passed, only the
  devlog and learning pillars, never ads, prices or crypto, at most 2 posts a day per account, and
  a daily one-line summary to the coordinator.
- **AI label:** yskills' call, off by default (2026-10-12); twin videos show "twin" in the preview;
  what the law asks for ads and realistic AI people is `market` §4. Never strip provenance data.
- **Official APIs only**, through an already-audited posting service. No browser bots, cookie
  uploaders, VPNs or emulators.
- **Accounts:** one real account per brand, made by yskills with
  [`templates/account-setup.md`](templates/account-setup.md); never bulk or fake persona accounts.
- **Crypto (Y-Coin):** posts about building it are fine; no promotion until `legal` cleared the
  coin (TikTok bans crypto promotion; EU MiCA wants a notified white paper first).

## Tools (one pick per job)

| Job | Pick | Notes |
|---|---|---|
| Schedule and post | the posting service the first Researcher picks from Metricool (connector), upload-post (free tier), Ayrshare (plugin) or Postiz | must support TikTok "upload to drafts" and scheduled direct post; a paid plan is a card |
| Instagram comments and DMs | Instagram Messaging API from the `social` Worker | private reply to a comment (one per comment, within 7 days), sent on its own only for keywords and gift texts yskills approved per brand in `social/brands.md`; replies only inside the 24-hour window; `is_user_follow_business` in the user profile gates follower-only gifts; needs a Business or Creator account and Meta app review, else ManyChat (Meta partner) by card |
| TikTok comments and DMs | no general DM API: Community drafts replies for yskills | partner tools that automate TikTok DMs only where TikTok allows it, by card |
| Hooks, captions, humanizer | `sergebulaev/tiktok-skills` references (MIT) | read first (CLAUDE.md install rule) |
| Launch and devlog videos | `latent-spaces/brag` (MIT plugin, HyperFrames) through the studio's Motion role | read its scripts before install |
| Trends | TikTok Creative Center (free, web), vidIQ connector (trial) | |
| Brand voice | Anthropic's Marketing plugin | per project (`toolbox`) |
| Ads data (later) | TikTok for Business connector, Windsor.ai | Marketer |

## Every week

1. Analyst: last week's numbers per post into `social/posts.md`; three lines on what to repeat or drop.
2. Scout: rising sounds and formats in each brand's niche, five hook ideas.
3. Lead: 5-7 posts across the pillars (learning, programming and devlogs, ads for our games and
   sites) from the backlog and every new `Done:` with a live link; briefs to the studio's Producer.
4. Lead: queue the ready videos with caption and time; anything for yskills goes to the coordinator
   as one short list.
5. Community runs daily; leads (a buyer, a press ask, a collab) go to the coordinator the same day.
