---
name: ship-check
description: "Run what CI runs, then fresh reviewers on the diff until clean. Use before any push, PR update or \"done\"."
---

# Ship check

## 1. Find what CI runs

In order of preference:

1. A repo skill named `verify` (`.claude/skills/verify/SKILL.md`): follow it and stop here.
2. A `verify` (else `ci`) script in `package.json`. Never run `ship` or `deploy`; run the
   non-deploy steps of `ship` by hand. A `check` script alone is not enough (lint, typecheck and
   unit tests only, `publish` skill): also run the `.github/workflows` steps it leaves out (3).
3. The steps in `.github/workflows/*.yml` that run on `pull_request`.
4. Otherwise whatever exists of: lint, typecheck (`vue-tsc --noEmit`, `tsc --noEmit`,
   `nuxt typecheck`, `pyright`), tests (`vitest run`, `npm test`, `pytest`), build.

Run them. If one fails, fix the cause and rerun; never skip, disable or loosen a check to get
green. If the repo has none of this, say so and suggest adding a `verify` script.

## 2. Review the diff

The writer misses its own mistakes: a model reviewing its work in the same context waves through
most of them and catches them when shown the same diff fresh. So the review is never yours alone:

1. Hand `git diff origin/HEAD...` (or against the base branch) to the `code-reviewer` agent with
   only the diff, the task goal in one or two sentences, and the checklist below. Not your
   reasoning or plan: it should judge the code, not your story about it.
2. Fix every blocking finding, rerun step 1, then hand the new diff to a **fresh** `code-reviewer`
   agent. Repeat until a pass finds nothing blocking; each pass tends to find more.
3. Optional findings: fix the plainly correct ones, skip the rest.

The checklist, for the reviewer and for your own read:

- Secrets, tokens, personal data, real emails in code, tests, fixtures or screenshots? `.env`
  files staged? `VITE_*` / `NUXT_PUBLIC_*` holding anything secret?
- Outside text (web, mail, user input) reaching SQL, a shell, a file path, `v-html`/`innerHTML`,
  or a model's system prompt?
- New routes without auth, write routes without CSRF protection where the app uses cookies?
- Leftover `console.log`, debug flags, commented-out code, TODOs you introduced?
- Tests for the new behavior? Did they fail before the change?
- Anything unrelated to the task? Move it to its own PR.

For changes touching auth, payments, tools or connectors, also run the `security-reviewer`
agent. For UI changes, run the `ui-review` skill.

### Optional: pre-launch audit

Once per go-live (not per PR) of a product with auth, payments or user data (duo-test first), run
Cloudflare's `security-audit` skill in full audit mode on top of `security-reviewer`: it adds a
recon map, hunters per input and a verifier that tries to disprove every finding. It is a lead
finder: one run finds roughly half, so say "partial coverage" in the report.

- Read 2026-10-28 (issue #347): MIT, markdown plus two Node validators that only read a JSON file
  (`fs` read, no network, no exec, no env); nothing in it sends data out; it tells agents to run
  target code only in a no-network sandbox. Its bundled tests were not run here. Pinned commit:
  `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` of `cloudflare/security-audit-skill`.
- Never `npx skills@latest add ...` (unpinned). Clone that commit into a scratch folder outside
  the target, copy `skills/security-audit/` into the run's skill dir, check `git diff` shows
  nothing but that folder. A newer commit needs a fresh read first.
- It spawns many agents: set a budget (`run-metadata.json` `budget`) and pick `quick` or `standard`.
  Output goes outside the repo (`~/security-audit-skill/<repo>/run-N`); fix confirmed findings in
  their own PR, treat `needs_validation` as open questions for yskills' deployment.

## 3. Push

Push only when everything above is clean. After pushing, watch CI and fix what it finds; checks
you could not run locally (Docker builds, secret scanners, deploy previews) still count.
