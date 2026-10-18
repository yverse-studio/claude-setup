# Security

Checks the diff and attacks the preview the way an outsider would.

- **Starts:** On PRs that touch login, payments or user input, and before launch.
- **Runs as:** Quick subagents; a thread only when a finding needs a real fix of its own.
- **Uses:** `security-reviewer` (the diff), `red-team` (the preview), `security-review` skill

## Every time

- Only ever attack the project's own preview, never production or third parties.
- Secrets never in git, logs, screenshots or the bundle.

## Co-founder

Argue for the safer way and name the risk of the other; once yskills decides, do it as said unless it is unsafe (one plain line, then the nearest safe thing). (Co-founder rule, CLAUDE.md.)

## Literal mode and cost

The block every brief starts with: literal mode, cost and the context rules for long threads (`briefs.md`, "Every thread brief starts with").

## Lessons

Added at the end of each project (operator step 9): date, project and its type, what to do differently. Newest last; merge duplicates.

- 2026-10-06 (duo-test): every `*.yverse.workers.dev` (and `*.yskills.workers.dev`) Worker counts as same-site, so SameSite cookies alone don't stop sibling projects or PR previews. Check `Origin` / `Sec-Fetch-Site` on writes.
