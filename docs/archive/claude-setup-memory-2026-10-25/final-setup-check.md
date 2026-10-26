---
name: final-setup-check
description: 2026-10-08 final setup check (claude-setup PR 77): why other projects lacked rules, the old cloud guard, and yskills' last five steps
metadata:
  type: project
  modified: 2026-10-08T07:45:25.152Z
---

yskills (2026-10-08 07:40) asked for one last check, then never to hear about the setup again.

Found:
- Rules like say done, talk first, notify, honesty, hands format and hand off at 200k lived only in this project's memory. PR 77 (merged) put them into `operator/templates/project-instructions.md`, together with a self-heal line: a thread that doesn't have claude-setup runs add_repo and reads its CLAUDE.md.
- The cloud environment ran an OLD context guard: +80k/+150k growth from the start, firing once. Main's setup.sh has 150k/200k absolute. Only re-pasting setup.sh fixes it. Loading the guard from the repo checkout was rejected by the security review, because a hook must not run code that a branch can change.
- company-xy CLAUDE.md assumes claude-setup is "installed next to" it; the Company XY project settings can't be seen from here.
- Ready-to-paste file: /mnt/project-files/claude-setup/final/project-instructions.txt.

yskills' final steps (said once, don't nag):
1. Allow in the Audit thread (CLAUDE.md apply).
2. Re-paste cloud/setup.sh.
3. Company XY: add the claude-setup repo.
4. Company XY: pick the same environment.
5. Company XY: paste the instructions.

Related: [[claude-setup-repo]].
