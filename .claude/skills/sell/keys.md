# Keys for a shop

## Where keys live

1. **On the Worker, set by yskills.** Cloudflare dashboard → Workers & Pages → the Worker →
   Settings → Variables and secrets → **Production**, type Secret, then Deploy. The Worker reads
   them from `env`.
   - Never in `wrangler.jsonc` `vars`, never in GitHub, the cloud environment or chat.
   - Never `NUXT_PUBLIC_*`: those ship to the browser.
   - They can only be set once the Worker exists, so after the Workers Builds import
     (`publish` skill), not with the first batch of questions.
2. **Previews get none of them.** Previews Base holds only preview-safe values (`publish` skill).
   Without `STRIPE_SECRET_KEY` a preview's checkout answers 503, which is why the sandbox
   checkout runs on the live URL and the e2e tests use signed fakes and stripe-mock.
3. **Local development.** `.dev.vars` (gitignored) holds test keys. `.dev.vars.example` lists
   the names.
4. **Stripe uses a restricted key** (`rk_test_…` from a sandbox now, `rk_live_…` at go-live), not
   the full secret key. Stripe no longer recommends secret keys for new integrations.
5. **The webhook endpoint is made by hand**, once per mode, in the Stripe Dashboard. Its
   `whsec_…` goes into Production as `STRIPE_WEBHOOK_SECRET`.
6. **Cloud threads can't reach the Stripe or Cloudflare APIs**, so they never handle a key; a
   deploy is the gate's merge (`gate.md`, `publish` skill).

## The keys

Use these secret names exactly; the Worker expects them (`server/utils/env.ts`).

| Secret | For | Create it | Test / live |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Checkout | [Stripe: API keys](https://dashboard.stripe.com/apikeys) → Create restricted key. Permissions: Checkout Sessions **Write** (subscriptions: see `stripe-workers.md`). Add more only when a call fails with a permission error. Guide: [restricted keys](https://docs.stripe.com/keys/restricted-api-keys) | Test key from a sandbox now; live key at go-live. A live key is shown only once |
| `STRIPE_WEBHOOK_SECRET` | Verifying webhooks | [Stripe: Webhooks](https://dashboard.stripe.com/webhooks) → Add destination → Webhook endpoint. URL `<live URL>/api/stripe/webhook`, API version = the SDK's (`recheck.md`), events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`. Copy its signing secret | One endpoint per mode: sandbox now, live at go-live |
| `SENDCLOUD_PUBLIC_KEY`, `SENDCLOUD_SECRET_KEY` | Creating parcels | [Sendcloud: create API keys](https://sendcloud.dev/docs/getting-started/how-to-create-your-api-keys) (steps in the Sendcloud panel) | Sendcloud has no test mode: parcels are only charged once you create a label |
| `RESEND_API_KEY` | Order confirmation emails | [Resend: API keys](https://resend.com/api-keys). Also verify the sending domain: yskills adds the records Resend shows under the domain → DNS → Records in Cloudflare | One key, "sending access" only |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login, if the shop has accounts | [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients), after the first deploy (Google needs the live URL) | One client |

`BETTER_AUTH_SECRET` (apps with logins): the `new-project` workflow sets a random one in
Production and a different one in Previews Base (`publish` skill); nobody types it.

## No Stripe account yet

The key card then starts with these steps (asked 2026-10-08, workflow-tests):

1. [Register](https://dashboard.stripe.com/register): email, name, country Deutschland. Skip
   "activate account" and business details; a sandbox needs neither.
2. Account picker (top left) → the sandbox, or **Create sandbox**. The sandbox banner shows at
   the top; every later step happens inside it.
3. Optional: [Payment methods](https://dashboard.stripe.com/settings/payment_methods) → PayPal,
   Klarna, SEPA, Apple Pay / Google Pay on.
4. Test: `/api/config` shows the key is set; pay with `4242 4242 4242 4242`, any future date, CVC
   `123`; payments show under [test payments](https://dashboard.stripe.com/test/payments).

A filled-in example for one Worker: `stripe/ANLEITUNG.md` in the "Tests" project files.

## Message template for the first batch

Fill in the project, and drop the rows it doesn't need. Ask for test keys only; live keys come at
go-live.

> Claude can't set these: they need your logins, and threads can't reach Stripe or Cloudflare.
> Paste each value into Cloudflare only, never into chat or GitHub. This comes after the repo is
> imported in Workers Builds, because the Worker has to exist first (`publish` skill).
>
> 1. Stripe sandbox: [API keys](https://dashboard.stripe.com/apikeys) → Create restricted key →
>    Checkout Sessions: Write. Copy the `rk_test_…` key.
> 2. Cloudflare: [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) →
>    `<worker>` → Settings → Variables and secrets → Add → type **Secret**, name
>    `STRIPE_SECRET_KEY`, paste the key, Deploy. Production only, never Previews Base.
> 3. Stripe sandbox: [Webhooks](https://dashboard.stripe.com/webhooks) → Add destination, with the
>    URL and events from the table in `keys.md`. Copy the signing secret and add it the same way
>    as `STRIPE_WEBHOOK_SECRET`.
> 4. …
>
> Then reply "keys done".

A dashboard secret takes effect when you press Deploy, so nothing has to be re-run afterwards.
