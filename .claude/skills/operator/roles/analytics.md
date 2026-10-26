# Analytics owner

Owns what the product measures: which user actions are tracked, the question each one answers, the money number it feeds, the legal basis, and the weekly line of numbers HQ shows. Before this role `market` §5 named four events in one bullet and no file held a project's list, so every builder invented event names and nobody read the numbers. GOV.UK lists the performance analyst as a role a service team may need ([Service Manual](https://www.gov.uk/service-manual/the-team/content-designer), read 2026-10-18). The numbers are what yskills' money goal rests on, so they are copied as read from the real dashboard or table, never estimated.

- **Starts:** Before launch of a site, app or game, and before any PR that adds a user action (signup, checkout, ad, share). A look-only or bug-fix PR skips it. The social Analyst keeps post metrics; this role owns what happens on the product itself.
- **Runs as:** A Sonnet subagent of the Planner (`docs/TEAMS.md`, Roster), for the plan and for one new action. It writes `analytics/TRACKING.md` and the weekly line, never the UI.
- **Uses:** [`../templates/tracking-plan.md`](../templates/tracking-plan.md), `market` (§5), `legal` (consent), `sell` (the money source), `search-first`
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Method

Sources and what each says: [`THIRD_PARTY.md`](../../../../THIRD_PARTY.md) (Analytics method).

1. **Objectives first.** One line each: the business goal and the HQ field it moves (`visitors7d`, `signups`, `paying`, `revenueMonth`; `docs/hq-rows.md`). Segment: "define business objectives", then map user actions to them. An action that moves none is not tracked.
2. **Few core events with properties.** At most 12 rows. A new event needs a question it answers that no existing event plus a property answers.
3. **Object + Action, Title Case, past tense:** `Checkout Started`, `Order Paid`, `Waitlist Joined`. Properties are `snake_case`. Never a date, number, id or name inside an event name, never a property key like `feature_1`: each one makes a new column downstream (Segment's rules).
4. **One basis per event, cookieless first.** `cookieless` = no cookie, no local storage, no personal data kept (tool list below). `consent` when `legal` says the tool needs it (its Cookies and storage row); then the consent banner is planned in the PRD and `Banner: ja` says so. A banner without a consent event is dropped.
5. **Pick the tool from the table; never add a tracker for a number a table already gives.** In a live project, adding a tool, a script or any call that sends visitor data to a new service waits for the `legal` check (`legal-reviewer` on the preview) and, when it costs money, for yskills' tap; the cookie-law call is `legal`'s, this role only records its answer in `Basis` and `Banner:`. Money numbers come from the money source, not the analytics tool: Stripe, or the project's own D1 `/api/stats` (`sell`, `docs/hq-rows.md`).
6. **Wire and prove it.** The Programmer sends each event on the preview; the Analytics owner reads the tool and checks the event arrived with its properties. An event never seen arriving is not "done".
7. **Weekly numbers line** (a scheduled trigger from launch, `market` §5): read the real sources, write the line, copy it into the project's HQ row fields.
8. **Co-founder pass:** say plainly when a number cannot move a decision (a vanity count) and which single number would; once yskills decides, track it as decided.

## Tools

Prices copied from each vendor's own page on 2026-10-18; confirm on the page before a purchase, and a paid plan is an ask-first item (CLAUDE.md).

| Tool | Basis | Price as read | Fit | Source, read 2026-10-18 |
|---|---|---|---|---|
| Cloudflare Web Analytics | cookieless: "does not use any client-side state, such as cookies or localStorage" (vendor page) | free | page views only; default for a site with no custom action | https://www.cloudflare.com/web-analytics/ |
| Umami Cloud | cookieless (vendor FAQ); MIT licence (LICENSE file) | Hobby $0/month: 100K events, 1 website, 6 months data; Pro $20/month: 1 million events | custom events and UTM; default when a site or game needs actions | https://umami.is/pricing; LICENSE in umami-software/umami |
| Plausible | cookieless (vendor); AGPL-3.0 (LICENSE.md) | Starter $9/month: 10k pageviews, 1 site | alternative if yskills prefers it; hosting it ourselves means AGPL duties | https://plausible.io (pricing section); LICENSE.md in plausible/analytics |
| PostHog | cookie in the browser by default, so the vendor says to use a cookie banner; `cookieless_mode: "always"` stores no distinct ID, needs "Cookieless server hash mode" switched on, and the vendor says it removes the banner; replay consent not read | first 1 million events/month $0 | funnels and replay; ask `legal` before replay or a cookie mode is chosen | https://posthog.com/docs/product-analytics/pricing.md; https://posthog.com/docs/privacy/gdpr-compliance; https://posthog.com/docs/product-analytics/cookieless-tracking.md |
| Own count in D1 | no third party | free | one Worker route that counts a few events; the least code for 3 to 4 events | none needed (our own code) |

## What it writes

`analytics/TRACKING.md` from [`templates/tracking-plan.md`](../templates/tracking-plan.md): `## Objectives`, `## Events` (event, question, money metric, basis, properties), `## Privacy` (`Tool:`, `Banner:`). `node <market skill folder>/scripts/analytics-check.mjs` checks the plan.

**Weekly numbers line**, one per project, German like the HQ rows:

`<project> KW<nn> | Besucher 7d: <n> | Anmeldungen: <n> | Zahlende: <n> | Umsatz: <n> € live | Quelle: <tool>, gelesen <ISO date>`

Each value is the number as the source shows it, or `nicht gelesen` when the source could not be read. `Testgeld` replaces `live` while Stripe is in test mode. `~`, `ca.`, "about" and "etwa" fail `checkNumbersLine` in the same script. The values go into the project's HQ row (`visitors7d, signups, paying, revenueMonth, revenueAt`); HQ stays the only dashboard.

## Bar

What the Tester checks on a PR that adds a user action or on launch (the evaluator takes these as acceptance criteria), and what `legal-reviewer` checks on the tracking part:

- `analytics/TRACKING.md` exists and `analytics-check.mjs` passes (headings filled, Object + Action names, no dynamic value, snake_case properties, money metric from the list, basis and `Banner:` agree).
- Every event in the plan fires on the preview with its properties, and no event fires that is not in the plan (Network tab or the tool's live view).
- With the banner declined, or no banner for a cookieless plan, the preview sets no cookie and no local storage entry from the tool and loads no third-party tracker.
- The Datenschutz page names the tool and what it does (`legal`); a `consent` plan has a banner that blocks the tool until accepted.
- The weekly line is real: each number matches the tool or table on the day it was read, and `Quelle` names it.

## Literal mode and cost

The block every brief starts with: literal mode, cost and the context rules for long threads (`briefs.md`, "Every thread brief starts with").

## Lessons

Added at the end of each project (operator step 9): date, project and its type, what to do differently. Newest last; merge duplicates.

- 2026-10-18 (Claude Setup, team roster): four event names lived in one bullet and no file held a project's plan or numbers. Write the plan before launch and read the real source every week.
