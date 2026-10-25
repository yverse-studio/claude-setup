# Game money: the verdict (2026-10-18)

Asked by yskills 2026-10-18 00:31 ("did you research right ... sota way to earn money with a game ... google what is actually the way").
Updates [2026-10-17-game-route.md](2026-10-17-game-route.md). **[V]** = vendor/SEO blog, not audited or official. No solo-dev postmortem with disclosed numbers turned up in six searches, so every euro figure below is an estimate.

## Route (one)

**Browser game on CrazyGames first (free, their ads), own site as the demo; if the test launch shows good play time, offer the same game to Poki; Steam and Roblox only for a proven winner.** Same as 10-17.

## Numbers found

| What | Number | Source |
|---|---|---|
| CrazyGames split | not in the official docs; 2026 jam terms list 60 % of ad revenue, 70 % of in-game purchases; payout monthly from 100 EUR via Tipalti | [Cinevva guide](https://app.cinevva.com/guides/publish-game-crazygames) [V] |
| Poki split | 100 % from players you bring, 50 % from Poki's traffic; Poki says 1 billion plays a month in 2026, best studios up to 1 M EUR a year | [Poki docs (10-17)](https://developers.poki.com/guide/working-with-poki), [Dealroom](https://app.dealroom.co/news/feed/poki-hits-1b-monthly-plays-as-developer-first-model-boosts-top-studio-revenues-tenfold-1) [V] |
| GameDistribution | 33 % of net revenue, 100 EUR threshold | [Playgama](https://playgama.com/blog/business-faqs/poki-vs-crazygames-vs-gamedistribution-revenue-share/) [V] |
| Typical portal game | 50 to 2 000 USD a month, most at the low end; a "well-performing casual game" 200 to 2 000 USD; one reported CrazyGames game fell from about 50 USD/day to 5 USD/day | [Cinevva](https://app.cinevva.com/guides/web-game-monetization), [PixelGameCraft](https://pixelgamecraft.com/blog/html5-game-income/), [Impulse](https://www.impulsemediahub.com/blog/html5-game-monetization-2026/) [V] |
| Ad rates | rewarded video eCPM about 15-28 USD US, 8-15 EU, 1-3 India/Brazil | Playgama data via [Cinevva](https://app.cinevva.com/guides/web-game-monetization) [V] |
| Steam | median game earned 249 USD gross in 2025 (about 174 net) [V]; 66 % of games under 1 000 USD, 90 % under 50 000 USD ([Ziva](https://ziva.sh/blogs/indie-game-revenue), VG Insights); Valve: 5 863 games earned over 100 000 USD in 2025 ([Mezha](https://mezha.ua/en/news/almost-6k-games-earned-over-100k-in-on-steam-in-2025-309376/)); copies per wishlist halved between 2020-22 and 2023-25 ([WN Hub on Zukowski](https://wnhub.io/news/analytics/item-52406)) |
| Roblox | payout about 0.0035-0.0038 USD per Robux, 0.0054 for age-verified US 18+ players since 2026-06-08 on eligible R15 experiences [V]; cash-out needs Premium and 13+, minimum 30 000 Robux [V]; over 1 B USD paid in 2025, top 10 creators about 33.9 M USD each ([Outlook](https://respawn.outlookindia.com/gaming/gaming-news/roblox-creator-payout-2025-a-billion-dollar-milestone)). **Share of creators earning anything: not found.** |

## Honest odds (inferred from the above, not measured)

- A first portal game: most likely **0 to 300 EUR in the first three months**, because it must pass QA, get featured traffic and keep players. A decent one: **100 to 1 000 EUR a month**; a hit is a lottery ticket.
- First payout needs 100 EUR and is monthly, so **no game route pays 250 EUR back by 2026-11-08**. Say this plainly to yskills.
- Steam: the typical game earns under 1 000 USD lifetime; it is for a game that already has an audience.
- Roblox: pays the biggest numbers at the top, but the share of creators who earn is unknown to me; the top is dominated by studios.
- Who actually makes money (inferred, leads only): people with an existing audience or several games (levelsio's fly.pieter.com claim, 10-17 report [U]), and studios with a catalogue on Poki. Volume of small games plus the one that sticks beats polishing one.

## What decides it

**Portal acceptance and retention**: whether CrazyGames' test launch shows good play time and gets the game to Full Launch. Everything else (split, SDK, engine) is secondary.

## First three steps

1. yskills opens the free CrazyGames developer account (about 5 minutes; package in `paperplane/` is ready).
2. Submit paperplane as Basic Launch (test, no money), read their play-time numbers after about a week.
3. If it tests poorly, build game 2 and 3 fast from the starter (a few days each) instead of improving game 1; offer the best one to Poki.

## What changes vs 10-17

- Route and ranking stand. Poki and CrazyGames terms re-checked: CrazyGames' split is still unpublished (only jam terms).
- New: GameDistribution 33 % (worse than both, skip). Steam median is far lower than "5-20 EUR per copy" implied: treat Steam as a lottery for a game with a proven audience.
- New: realistic expectation is small; the 10-17 report said "earns from day one" and should have said "earns little at first".
- Gap: no independent payout data per 1 000 plays exists in what I could search; CrazyGames' dashboard after the test launch will be the first real number.
