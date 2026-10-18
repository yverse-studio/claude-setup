# Stripe on Cloudflare Workers

## Verified

The templates in `templates/` were checked on 2026-10-03:

- They ran in a minimal Nuxt 4 app (`nitro` preset `cloudflare_module`) with `stripe@23.0.0`
  (API `2026-09-30.endive`) and `zod@4`.
- `nuxt typecheck` and `nuxt build` both passed.
- The 9 tests in `templates/tests/shop.spec.ts` passed against `wrangler dev` with a local D1.
  Two of them create real Checkout Sessions against
  [stripe-mock](https://github.com/stripe/stripe-mock), Stripe's official mock, which rejects
  any parameter its API spec does not know.
- A security review covered binding each order to its session, fulfilment retries, weight limits
  and key scope. Its fixes are in.
- stripe-mock checks parameter names, not every business rule. The first sandbox checkout with
  a real test key is the final check (SKILL.md, go-live).

The digital-product variant below ran green in yverse-studio/duo-test.

## The flow

1. **Our order page.** It shows the cart, address, email, shipping rate, delivery time, total
   and the AGB and Widerruf links.
2. The buyer presses **"Zahlungspflichtig bestellen"**, which calls `POST /api/checkout`. That
   endpoint:
   - prices the order on the server;
   - writes it to D1 as `pending`;
   - creates a Checkout Session on the Stripe-hosted page and returns its URL.
3. **The buyer pays on Stripe's page.**
4. **We learn about the payment twice, both through `markOrderPaid`.** It flips the order
   exactly once, and only for the Checkout Session the order was created with:
   - the webhook `POST /api/stripe/webhook`;
   - the return page `/danke?session=cs_…`, which calls `POST /api/checkout/confirm`.
5. **Whichever call flips it runs `fulfilOrder`** with `waitUntil`: the confirmation email with
   the legal PDFs attached and, for physical goods, the Sendcloud order.
   - `fulfilled_at` is set only when all of that worked.
   - The admin view lists paid orders without it and has a button that runs `fulfilOrder`
     again. The email carries an idempotency key, so a retry never sends it twice.

## Templates

| Template | Goes to | What it does |
|---|---|---|
| `shared/shop.ts` | `shared/` | Products, prices in cents, shipping countries and rates, Kleinunternehmer switch |
| `server/utils/env.ts` | `server/utils/` | Typed Worker env (merge with an existing one); `siteUrl` from the `SITE_URL` var |
| `server/utils/stripe.ts` | `server/utils/` | `useStripe` (fetch client; `STRIPE_API_BASE` points it at stripe-mock in tests), `readStripeEvent` (raw body + SubtleCrypto signature check) |
| `server/utils/orders.ts` | `server/utils/` | `createPendingOrder` (also deletes unpaid orders after 30 days), `attachSession`, `markOrderPaid` (idempotent, session-bound, logs money for closed orders), `setOrderStatus`, `markFulfilled` |
| `server/utils/fulfil.ts` | `server/utils/` | Confirmation email via Resend with AGB, Widerrufsbelehrung and Muster-Widerrufsformular attached. Add the Sendcloud call here (`physical.md`) |
| `server/api/checkout/index.post.ts` | same | The order button's endpoint |
| `server/api/checkout/confirm.post.ts` | same | Return page check |
| `server/api/stripe/webhook.post.ts` | same | Paid, SEPA, failed, expired, refunded, disputed |
| `server/migrations/0001_orders.sql` | the D1 `migrations_dir` | `orders` table |
| `ci.yml` | `.github/workflows/` | Verify only, with stripe-mock as a service. No keys and no deploy: Workers Builds deploys (`publish` skill) |
| `tests/shop.spec.ts` | `tests/e2e/` | Signed fake webhooks against `wrangler dev`, order validation, and real sessions against stripe-mock |
| `playwright.config.ts` | project root | Starts `wrangler dev` with the test webhook secret, plus the stripe-mock vars when `STRIPE_MOCK` is set |

**What the project still adds:**

- the order page;
- the `/danke` page;
- the legal pages and PDFs (`legal-de.md`);
- the Widerrufsbutton flow;
- the Sendcloud call;
- an admin orders view, with the fulfilment retry button;
- the rate-limit binding on checkout, confirm and withdrawal.

All of these are built in the project's design. Replace the placeholders `example-mug`,
`Beispielshop` and `example.de` in the same PR.

## Wiring

- `wrangler.jsonc` and `package.json` follow the `publish` skill: a `previews` block that repeats
  every binding on its own resource (the D1 `<name>-preview` and a second rate-limit namespace),
  committed D1 ids, and its `deploy` script. On top of that this kit needs
  `"compatibility_flags": ["nodejs_compat"]`, a D1 binding `DB` and `migrations_dir` pointing at
  the migrations.
- `package.json` needs a `verify` script that runs typecheck, unit tests, build and the e2e tests.
- `wrangler.jsonc` `vars`: `SITE_URL` is the canonical `https://` address. Links and email
  attachments use it instead of whatever host a request came in on.
- `playwright.config.ts` from the templates starts the real runtime with a test-only webhook
  secret. CI runs stripe-mock as a service (`ci.yml`). Locally:

  ```bash
  docker run -p 12111:12111 stripe/stripe-mock
  STRIPE_MOCK=http://127.0.0.1:12111 npx playwright test
  ```

- The webhook tests only use `request`, so they need no browser.
- To try a real test payment locally, on yskills' PC: put test keys in `.dev.vars`, then run
  `stripe listen --forward-to 127.0.0.1:8787/api/stripe/webhook`. It prints a `whsec_…` for
  `.dev.vars`. Test card `4242 4242 4242 4242`; 3-D Secure `4000 0027 6000 3184`.

## Variants

**Digital product, one-off** (duo-test pattern):

- Requires login. Use the user id as `client_reference_id`.
- Use a `purchases` table with a unique `stripe_session_id` instead of `orders`.
- No address or shipping.
- Before the button, a required checkbox: "Ich stimme zu, dass ihr vor Ablauf der Widerrufsfrist
  mit der Ausführung beginnt, und weiß, dass ich dadurch mein Widerrufsrecht verliere"
  (§ 356 Abs. 5 BGB).
  - The endpoint rejects the request without it and stores the consent in the session metadata.
  - The confirmation email repeats it. The waiver only counts once that email is sent, so it is
    part of the recipe, not optional: send it whenever `confirmation_sent_at` is NULL (webhook
    retry or return page), not only on the first insert, with a Resend idempotency key.
- Refuse a second purchase of the same one-off product (409), and accept a session only when
  `mode`, `amount_total`, `currency` and the product all match.
- **Live-key lock:** checkout refuses a `sk_live_`/`rk_live_` key until the seller details in
  the project's own `shared/business.ts` (name, street, city, email, phone) are filled and `RESEND_API_KEY` and
  `MAIL_FROM` exist. Write it as a pure, unit-tested function in the project's `shared/checkout.ts` (not in
  `templates/`).

**Subscription (Billing):**

Not yet run on Workers; the first subscription project proves it and updates this section.

- **Catalog:** one Product per plan (Starter, Pro…), monthly and yearly as two Prices of that
  Product. Give every Price a `lookup_key` and find it by that key, so sandbox and live need no
  id changes.
- **Checkout:** `mode: 'subscription'` with the user's Stripe Customer (`customer`), never
  `payment_method_types`. The order button rules above still apply.
- **The [Better Auth Stripe plugin](https://www.better-auth.com/docs/plugins/stripe)** does the
  customer, checkout, portal and webhook parts when the app uses Better Auth. As of 1.7.7 its
  peer range is `stripe` ^18 to ^22, so pin `stripe@22` in that project (check `recheck.md`).
- **Webhook events** (select them on the endpoint in the Stripe Dashboard, see `keys.md`):
  `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. They are not
  optional: renewals, failed payments and cancellations only arrive this way.
  - Access follows the stored subscription `status` (`active`, `trialing`), not the return page.
  - Map each event to the user through its Stripe customer or subscription id, stored in our
    DB. Metadata is a fallback only.
  - Payment retries and failed-payment emails: turn on Smart Retries and the customer emails in
    the Dashboard (Billing → Revenue recovery) instead of coding them.
- **Customer Portal** for cancelling, plan changes and card updates. Configure it once in the
  Dashboard (Settings → Billing → Customer portal). Add a Kündigungsbutton (`legal-de.md`).
- **Restricted key** additionally needs Customers Write, Prices Read, Subscriptions Read and
  Customer portal Write.

**Selling across the EU above the VAT threshold, digital only:** Stripe Managed Payments.
Stripe becomes the seller, so it works through Checkout only. Check `recheck.md` first.

## Gotchas

- **Raw body.** `readRawBody` must see the exact bytes; any JSON parsing before it breaks the
  signature.
- **Fulfil on `payment_status === 'paid'`, never on the `completed` event alone.** SEPA
  completes unpaid and pays days later.
- **Keep the webhook fast:** do the slow work after the 2xx with `event.waitUntil`. Stripe
  retries for up to 3 days.
- **Stripe sends events more than once and out of order.** Every write is guarded by the state
  it expects.
- **The webhook secret differs between sandbox and live.** Each mode has its own endpoint, made
  by hand in the Dashboard (`keys.md`), and its own `whsec_…` in the Worker's Production secrets.
  So going live means a new endpoint and a new secret, a new event means editing the endpoint, and
  a disabled endpoint has to be re-enabled there. Set the endpoint's API version to the SDK's.
- **One Stripe account serves several projects.**
  - Every endpoint gets every account event, so handlers ignore sessions and charges they
    don't know. `markOrderPaid` requires the order's own session id, because a Payment Link
    can carry any `client_reference_id`.
  - Refunds and disputes that match nothing are logged, not failed.
- **Sandbox orders stay in the live D1.** `livemode` marks them; delete them at go-live
  (`DELETE FROM orders WHERE livemode = 0 OR livemode IS NULL`).
- **`automatic_tax` silently collects nothing** until Tax settings have a head office address
  and an active registration for the buyer's country; there is no error. Before turning it on,
  check both in the sandbox, run a test Tax Calculation and make sure `taxability_reason` is not
  `not_collecting`. Product tax codes come from Stripe's [tax code list](https://docs.stripe.com/tax/tax-codes);
  never guess one, let yskills (or the Steuerberater) confirm it.
- **A 100% promotion code** completes with `payment_status: 'no_payment_required'`. Fulfil on
  that too if the project offers such codes; otherwise leave promotion codes off.
- **Never put a price in a request body or in metadata the client can influence.**
- **Rate-limit checkout, confirm and withdrawal** with the Workers rate-limit binding
  (`ratelimits` in `wrangler.jsonc`, keyed on `cf-connecting-ip`, an IPv6 address cut to its /64
  because one user can rotate through the whole /64), with its own `namespace_id`
  under `previews` (`publish` skill). It works in `wrangler dev` too. Without it, anyone can loop
  the endpoint, filling D1 and burning the Stripe API rate limit.
- **Legal texts live in one shared TS module**, so the pages and the confirmation email can't
  drift apart.
