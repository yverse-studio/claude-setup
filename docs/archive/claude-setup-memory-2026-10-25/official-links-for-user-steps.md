---
name: official-links-for-user-steps
description: When yskills must do something by hand (keys, settings, consoles), give numbered steps with the exact official link for each step
metadata:
  type: feedback
  modified: 2026-10-03T08:55:22.057Z
---

2026-10-03 (duo-test thread): yskills did not understand the deploy-key instructions and said "give me links when you need me to do something, the official and correct one, so I only need to do whatever it says".

**Why:** they act on the message directly; vague steps ("add the secrets") made them ask why Claude can't do it.
**How to apply:** for every manual step, a numbered line with a deep link (e.g. `https://github.com/<owner>/<repo>/settings/secrets/actions/new`, `https://dash.cloudflare.com/profile/api-tokens`, `https://dashboard.stripe.com/test/apikeys`), the exact button names, and the exact secret names. Say first in one line why Claude can't do it itself. Belongs in claude-setup's global CLAUDE.md too (owned by the Global Claude setup thread). Related: [[ask-with-choice-cards]], [[cloud-network-blocks-deploys]].
