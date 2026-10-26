---
name: social-team
description: "Use for posting, comments, DMs, the idea backlog, account setup, brand deals or a social media plan. Runs yskills' brand accounts as a team: Social Lead, Scout, Community, Partnerships, Analyst."
---

# Social team

yskills, 2026-10-12: "be my social media manager", "a real working company start up that generates
money". The `video-studio` team makes each video; this team decides what gets made, where and when
it goes out, answers the people who react, and measures what earns. Every post has a money job:
follow, profile tap, visit, install, sign-up or sale. Checked 2026-10-17 and 2026-10-18; sources in
[`docs/research/2026-10-17-social-team.md`](../../../docs/research/2026-10-17-social-team.md) and
[`docs/research/2026-10-18-brand-deals.md`](../../../docs/research/2026-10-18-brand-deals.md).

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
| Partnerships | brand deals and sponsors: media kit, brand list, outreach drafts, offers, contract check, delivery, invoice line | [`roles/deals.md`](roles/deals.md) | subagent of the Lead; a thread `Deal · <brand> · <partner>` per real offer |
| Analyst | numbers per post, what to repeat or drop, new lessons | [`roles/analyst.md`](roles/analyst.md) | subagent of the Lead in the weekly routine |

Paid ads stay with the Marketer (`operator/roles/marketer.md`); the studio makes their creatives.
No own law or security team: Partnerships hands contracts to the operator's Legal role and
suspicious brand mail to its Security role (`operator/roles/legal.md`, `security.md`).
Thread titles follow the operator rule; models per the Models line in
[`docs/WORKFLOW.md`](../../../docs/WORKFLOW.md).

## Where things live

One project `social` (decided 2026-10-26, made by the `new-project` workflow, `docs/USING.md`) is
the ideas-to-posts app for every brand: `https://social.yverse.workers.dev`, Worker + D1.

| yskills sees | What it holds |
|---|---|
| Ideen | one text box; each idea gets date, brand, pillar, status (idea, scripted, draft, approved, scheduled, posted, dropped) |
| Entwürfe | per draft: script, player, caption, slot; buttons Freigeben, Ändern (one line why), Verwerfen, Jetzt hochladen |
| Plan | the next days' two slots per account, what fills them |
| Auto-Post | the switch per account (Posting below) |

- Login: a passkey on his phone (Face ID); the first passkey registered after the deploy is the owner, registration closes after it. No password, no secret anywhere.
- Claude reads `GET /api/feed` (ideas, statuses, his taps; nothing private in it) and writes drafts by committing `content/drafts/<id>/` (script, caption, `final.mp4`) to the repo; the merge deploys them. Posted state goes back the same way. No API key for Claude.
- The daily routine (a cloud trigger at 07:00 Berlin, the Social Lead's daily step): read the feed, script new ideas, make drafts through the daily lane (below), queue approved ones (or, with auto-post on, Critic-passed ones) into today's slots through Metricool, write the one-line summary to the coordinator.
- HQ (Company XY) gets one row with the link and today's count (`docs/hq-rows.md`), not a copy of the app.
- Until a slice of the app is live, ideas land in `/mnt/project-files/<project>/social/ideas.md` and finished videos are attached in the thread reply. Videos of a product's own campaign stay in its `video/<slug>/` (`video-studio`).

The comments and DMs webhook and the `posts.md`, `brands.md`, `deals.md` notes join the same project when Community and Partnerships start.

## Daily lane and the full studio

2 videos a day cannot each go through the seven-role studio (research 2026-10-26,
[`docs/research/2026-10-26-claude-video-autopost.md`](../../../docs/research/2026-10-26-claude-video-autopost.md)).

- **Daily lane** (the slots): one of three templates, filled from a Writer script: real-photo or
  screenshot slideshow (the Larry format), screen-capture devlog (Playwright capture of the real
  product), explainer (`video-studio` `templates/explainer/`, new look per art direction). Then one
  fresh Critic pass on the cut. Minutes, not hours. A template is used only after its first video passed the Critic.
- **Full studio** (`video-studio` pipeline): 1-2 flagship videos a week, ads, launches.
- **Empty slot:** when no idea of his is ready, the Lead fills it from a `Done:` line of any project
  (devlog or learning pillar only, real footage); never a bait, ad or crypto topic (yskills, 2026-10-26).

## Posting

Two kinds of account (yskills, 2026-10-18: "when i give you another account or you make one for
our projects you get full decision power, it's just my personal now, i want to be authentic and creative"):

- **His personal account (@xyskillsx):** yskills decides what goes up; the team makes each idea great
  in his taste (`roles/lead.md`, [`xyskillsx-style.md`](xyskillsx-style.md)). A ready video goes to drafts or the queue on "upload"; yskills adds a
  trending sound and taps post (`video-studio` delivers a music-free master for that). Route
  (yskills, 2026-10-26): Metricool with `autoPublish` off, so his phone gets the video at the planned
  time; never a browser bot into TikTok Studio's drafts (`learnings.md`).
  - **Auto-post** there only while yskills has switched it on in the `social` app. The switch is his
    standing ok for posts under CLAUDE.md's ask rule; note the date in project memory. Only videos the
    Critic passed, only the devlog and learning pillars, at most 2 a day, and a daily one-line summary
    to the coordinator. He chose it on 2026-10-26 ("jeden Tag 2 Videos hochladen"); the switch starts
    off after a deploy and he flips it himself. Direct posts carry the licensed music bed, since an API
    post cannot add a trending sound.
- **Project accounts** (one he hands over, or one made for a project): the social team has full
  decision power over content, schedule, profile and strategy. That message is yskills' standing ok
  for posts on them; no switch needed. The Lead posts what the Critic passed and sends a daily
  one-line summary to the coordinator.
- **On every account:** never ads, prices or crypto promotion without yskills' ok; money, brand deals
  and signatures stay ask-first (`roles/deals.md`). At most 2 posts a day per account. An account
  younger than 30 days or with fewer than 20 posts gets drafts only (new accounts that direct-posted
  by API were shadowbanned, `learnings.md`); start at 1 a day, the second only while reach holds.
- **AI label:** yskills' call, off by default (2026-10-12); twin videos show "twin" in the preview;
  what the law asks for ads and realistic AI people is `market` §4. Never strip provenance data.
- **Official APIs only**, through an already-audited posting service. No browser bots, cookie
  uploaders, VPNs or emulators.
- **Accounts:** one real account per brand or project, set up with
  [`templates/account-setup.md`](templates/account-setup.md) (sign-up with phone and captcha is yskills'
  hands step); never bulk or fake persona accounts.
- **Crypto (Y-Coin):** posts about building it are fine; no promotion until `legal` cleared the
  coin (TikTok bans crypto promotion; EU MiCA wants a notified white paper first).

## Tools (one pick per job)

| Job | Pick | Notes |
|---|---|---|
| Schedule and post | **Metricool** (picked 2026-10-18; its claude.ai connector `createScheduledPost`, `getScheduledPosts`, `getBestTimeToPostByNetwork`) | setup below; fallback upload-post (free tier) or Ayrshare if the free plan's monthly cap is below 2 a day; a paid plan is a card |
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
5. Community runs daily; leads (a buyer, a press ask) go to the coordinator the same day, brand
   and collab messages to Partnerships.
6. Partnerships, monthly: refresh the media kit, ten fitting partners in `social/deals.md`,
   outreach drafts for the best three as one ask to the coordinator.

## Metricool, once per person

yskills' hands, about 5 minutes; the thread sends exactly these three steps through the coordinator:

1. Account: `https://app.metricool.com/` → Sign up (free).
2. In Metricool, the brand → Connect at TikTok (or Instagram, YouTube) → log in with that account, allow.
3. `https://claude.ai/settings/connectors` → "Metricool Social Media Management" → Connect, same Metricool login.

Then the Lead checks `getBrandSettings` shows the account and writes the date into `social/brands.md`
(or the app). A new project account later only needs step 2. The free plan's limits on scheduled
posts are checked against the plan's slots before the first week; over the cap is a card.
