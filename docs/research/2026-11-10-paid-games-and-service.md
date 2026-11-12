# Paid games and a personalised-game service (2026-11-10)

Written for the vacation game "Xin Xiao" (a chapter anthology made from a trip). Extends [2026-10-18-game-money.md](2026-10-18-game-money.md), which only covers portal ads. **[S]** = search summary, no page opened; **[V]** = Valve or vendor docs read on the date; the rest is inferred. Source table with all links: `/mnt/project-files/vacation-game/research/setup-vs-best-practice.md`.

## Paid direct sales

- Two routes, same price: Steam (full game via Electron, demo = the free chapters) and our own site (Stripe Checkout, `sell` skill). Steam keeps 30 %, our site pays Stripe fees only; Kleinunternehmer means no VAT until the threshold, then Stripe Managed Payments (`sell` §1).
- itch.io is an extra store page, not the checkout: it either makes us the seller (we handle VAT) or the merchant of record [S] ([itch.io payments](https://itch.io/docs/creators/payments)).
- Price parity: written for Steam keys sold elsewhere; reach over a key-less own site is disputed and a class action alleges wider enforcement [S]. Same price is safe either way; no link to the shop inside the Steam build. Read the Steamworks terms before launch (not done).
- Steam is for a game with an audience: median 249 USD gross, 66 % of games under 1 000 USD (money note). Demo and wishlists come first (`game-3d` §5).

## Pricing a 1 to 2 hour game

- 2026 guides put short narrative games at about 5 to 15 USD; 9.99 is defensible but high per hour; Steam refunds apply under 2 hours played [S] ([gtstu](https://gtstu.com/steam-indie-game-pricing-strategy/), [Steam Page Analyzer](https://www.steampageanalyzer.com/blog/steam-pricing-strategy)).
- Default: 4.99 to 6.99 EUR for two chapters plus more; 9.99 only with 2+ hours. No sales data for this genre; change after the demo conversion number.

## Personalised-game service ("your trip as a game")

- Other services exist (GameQ, GameGift, Fiverr listings, [Wikipedia](https://en.wikipedia.org/wiki/Personalized_video_game), [dev.to GameGift](https://dev.to/vulcanwm/introducing-gamegift-create-and-gift-personalised-games-in-minutes-5bng)) [S]. Prices of Muksun Games (about 99 USD) and Oin (24.90 USD) were not confirmed.
- A hand-built splat chapter will not fit 24.90 EUR. Before pricing: read each competitor's order page for delivery time and required inputs, then price by our hours per chapter.
- The tool route (importers for Polarsteps and Day One, a repeatable workflow) is what makes the service cheap; the first customers are the trip's own people (real people only stylised with their OK).
- Legal before the first sale: `legal` skill (photos of third parties, Widerruf for digital goods).
