---
name: mypage-repo
description: Facts about yskills/MyPage (portfolio yxie.de) and its Claude onboarding PR, as of 2026-10-04
metadata:
  type: project
  modified: 2026-10-04T17:27:37.339Z
---

yskills/MyPage = yskills' portfolio (yxie.de): Nuxt 4 static prerender, Three.js solar system nav, canvas CV game, Tailwind v4, de/en, served as Cloudflare Workers static assets (Worker `yxie-portfolio`, no script). Default branch is `origin`, not `main`.

2026-10-04: onboarded in PR #2 (CLAUDE.md, .claude/settings.json, verify skill). Found every CI deploy since CI existed had failed: wrangler-action fell back to wrangler 3.90 which rejects assets-only config; PR runs lockfile wrangler 4.125.0 instead. Repo was otherwise clean (no tracked env/build files).

Cloud container gotchas: lockfile needs npm 11 (`npx -y npm@11.17.0 ci`); shader/audio checks need a Chrome wrapper with `--no-sandbox` (root).

PR #2 merged 17:42. First deploy after it ran wrangler 4.125 fine but failed because the repo has no CLOUDFLARE_API_TOKEN secret (empty in the log); asked yskills to add it and re-run.

22:02: yskills picked deploy-from-thread; failed with 401 on the asset upload (proxy overwrites the upload JWT, see [[cloudflare-keys-in-cloud-env]]). Nothing went live. MyPage still needs the GitHub secret CLOUDFLARE_API_TOKEN.

Related: [[claude-setup-repo]]
