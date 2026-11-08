# Lessons inbox

One shared file, `/mnt/project-files/claude-setup/LESSONS-INBOX.md` (network mount: trailing-slash path, re-read ~10 s after writing). Append-only, one block per finding. Cloud threads write here while the GitHub App is disconnected and cannot open an issue or a PR.
Write a block only when the next thread would repeat the mistake without the lesson; a mechanical pattern becomes a check or test, not text (`docs/MAP.md`, Where a lesson goes). Never edit another thread's block except its `Seen:` and `Status:` lines; a repeat finding bumps `Seen:` instead of adding a block.
`Seen: 3x` or `confirmed by yskills` is promoted: a rule line in its one home, via PR. `1x` stays here.
The Monday "Weekly repo audit" routine turns open blocks into one patch, `/mnt/project-files/claude-setup/handoff/<date>-lessons.patch`; the laptop applies and pushes it, then the block gets `Status: PR #n`.
When the GitHub App is connected again, friction goes into a `loop:setup` issue and the block links it.

Block format:

```
## <YYYY-MM-DD> · <thread title> · <project>
Finding: <one line, what went wrong or what rule was missing>
Rule: <file:line that is wrong or missing, or "none">
Seen: 1x | 3x | confirmed by yskills
Fix: <one-line proposal: the new text, check or hook>
Evidence: <path, PR, transcript quote>
Status: open | PR #n | dropped (<why>)
```

Blocks, newest last:
