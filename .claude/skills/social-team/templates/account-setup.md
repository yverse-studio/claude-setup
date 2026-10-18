# Account setup: <brand> on <platform>

Signing up needs a phone number, sometimes an ID check, and captchas: only yskills can do it, and
accounts made by bots are banned in bulk. About 5 minutes per account; after that the Social Lead
runs it.

## yskills, once

1. Sign up in the phone app with the brand's address (Claude's mailbox, operator `templates/mailbox/`) and the handle the Lead suggests.
2. Switch to a Business account (TikTok: commercial music, link in bio, stats; Instagram: needed for API posting and messages, linked to a Facebook page).
3. Tap the posting service's connect link the Lead sends (OAuth). Claude never gets the password; the token lives as a Worker secret.
4. Turn on two-factor login; the password goes in yskills' password manager.
5. Warm-up, 3-5 days: 10 minutes a day scrolling and liking in the niche from your own phone and network; no posts from tools yet.

## The Social Lead, from then on

- Name, bio, picture and banner in the brand's look; fields the API cannot set go to yskills as one "paste this" line via the coordinator.
- Link in bio with UTM, pillars, the weekly plan, the queue, Community, the Analyst's numbers.
- A row for the account in `social/brands.md`: handle, platform, connected (date), warm-up done (date), auto-post on or off.
