# Making money

Checked 2026-10-03. Plugins are `@claude-plugins-official` unless noted. yskills is in Germany:
EU VAT and German legal pages apply from the first euro. **Anything that sells (checkout, shop,
subscriptions, shipping) is built with the `sell` skill**, which has the questions, keys,
tested templates and German law; this table is the overview.

| Need | Pick | Why / watch out | Add it |
|---|---|---|---|
| One-off payments or subscriptions (default) | **Stripe Checkout** (hosted page) + Billing + Customer Portal | 1.5% + €0.25 per EEA card, no monthly fee. Kleinunternehmer charge no VAT; above €10k EU sales a year see `sell` | `stripe` plugin; MCP `https://mcp.stripe.com`; `sell` skill |
| Digital goods sold EU-wide, VAT handled for you | **Stripe Managed Payments** (Stripe is merchant of record) | +3.5%; digital only; German sellers supported; Checkout or Payment Links only | same |
| Physical product with shipping | **Stripe Checkout** after our own order page, **Sendcloud** for labels | No merchant of record takes physical goods; packaging and product law apply (`sell` → `physical.md`) | `sell` skill |
| Many products, variants, stock, or a non-developer runs the shop | **Shopify** | Monthly fee plus payment fees, but admin, stock and checkout included | Shopify admin |
| Alternative merchant of record (digital only) | **Paddle** or **Polar** (5% + €0.50) | | API key |
| PayPal, Klarna, SEPA, Apple Pay buyers | **Turn them on in Stripe** (Dashboard > Payment methods) | Checkout shows them with no code; PayPal adds its own fee | Stripe Dashboard |
| In-app purchases (iOS / Android) | **RevenueCat** | One API over App Store and Play billing, plus Stripe on the web; paywall and review rules: the `store` skill | `revenuecat` plugin |
| Ads on a website | **Google AdSense** | Needs cookie consent in the EU (TCF CMP) | script tag + consent banner |
| Ads in a web game (interstitial, rewarded) | **AdSense H5 Games Ads** (beta) | Made for HTML5 games like TellMeY | AdSense sign-up, Ad Placement API |
| Ads in a native app | **AdMob** | | SDK |
| Running your own ads (marketing) | Meta, TikTok and Google Ads managers + campaign copy | Set up conversion tracking first (see growth.md) | ECC skill `marketing-campaign` |
| Billing support ops (refunds, churn, failed payments) | Stripe + ops skills | | ECC skills `customer-billing-ops`, `finance-billing-ops` |
| Pricing and market check | Competitor research | | `market`, ECC skill `product-lens` (global) |

## German / EU legal checklist (before going live)

The `legal` skill is the full list for any app (plus its privacy scan and the `legal-reviewer`
agent); the lines below are the money-related part.

- Shops and paid apps: everything in the `sell` skill's `legal-de.md` (Impressum, Datenschutz,
  AGB, Widerruf with the 2026 Widerrufsbutton, order button, price notes, warranty notice).
- **Cookie consent** before any non-essential cookie or tracker (TDDDG + GDPR); cookieless
  analytics (Plausible, Umami, PostHog cookieless mode) avoid the banner for analytics alone.
  Google ads need a certified TCF 2.2 consent banner.
- **Licensing** of content you use (music, stock, AI-generated assets' terms).
- Data processing agreements (AVV) with processors; prefer EU regions where offered.
