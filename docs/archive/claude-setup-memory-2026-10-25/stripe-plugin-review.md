---
name: stripe-plugin-review
description: Stripe onboarding thread (2026-10-04): plugin MCP needs browser OAuth; duo-test payment matches Stripe's plan; billing recipe in claude-setup PR #5 (merged)
metadata:
  type: project
  modified: 2026-10-04T06:28:41.523Z
---

2026-10-04, thread "Stripe onboarding": `stripe@claude-plugins-official` (0.10.3) installs fine in the custom cloud environment, but its MCP (mcp.stripe.com, so `stripe_implementation_planner`) needs a browser OAuth login, impossible in cloud threads. Its `stripe-best-practices` skill is Stripe's plan and works offline. api.stripe.com is reachable in the custom environment.

duo-test's 6 € payment already matches that plan; no change needed. Gaps in the `sell` skill (subscriptions/Billing recipe, Stripe Tax registration trap, 100% promo `no_payment_required`, plugin note) went into claude-setup PR #5 (merged 2026-10-04). Billing is not yet proven on Workers; the first real subscription project proves it. Better Auth Stripe plugin 1.7.7 only accepts stripe ^18 to ^22.

**How to apply:** for Stripe work, turn on the Stripe plugin per project and follow `sell` + `stripe-best-practices`. Related: [[cloud-network-blocks-deploys]].
