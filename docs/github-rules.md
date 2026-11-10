# GitHub rules (checked 2026-11-02 against GitHub's Acceptable Use Policies and Community Guidelines)

What GitHub forbids that this setup could touch, what we do about it. Sources:
<https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies>,
<https://docs.github.com/en/site-policy/acceptable-use-policies/github-sexually-obscene-content>,
<https://docs.github.com/en/site-policy/github-terms/github-community-guidelines>. The account
`yskills-claude` was suspended 2026-10-29 without a stated reason; these are the plausible causes.

| GitHub rule | Risk in this setup | Our rule |
|---|---|---|
| Sexually obscene content: pornographic content, graphic depictions of sexual acts, text included; private repos are not exempt (AUP applies to all content) | the 18+ Ren'Py game `companyxy-spiel` (story, scenes, `kontakt_sex*.ogg`) was a private repo | **No 18+ content on GitHub at all, private repos included** (yskills 2026-11-02). 18+ work lives on the laptop (`docs/laptop-folders.md`: `Private18`, the local clone, bundles) until it has its own git host. A thread that finds 18+ paths or text in a branch stops the push and says so |
| Spam and inauthentic activity: automated excessive bulk activity, inauthentic interactions, undue burden through automated means | 300+ PRs in weeks, a 15-minute cron, 3-OS CI per PR, bursts of pushes and API calls from a bot account | One PR per repo and concern, pushes and merges spaced out (10 min between repos in a sync; a merge is a push to main, yskills 2026-11-08), no polling loops against the API (`deploy-watch` keeps one lean cron), CI on one runner and only in public repos (`publish` skill) |
| Account terms: one free personal account per person; a machine account is allowed but only for running a machine | `yskills` and `yskills-claude` were two free accounts of one person, and the machine account opened PRs and comments like a person | `yskills-claude` stays unused. Claude pushes through yskills' login on the laptop or the GitHub App in the cloud; no second free account |
| Services usage limits, excessive bandwidth: large binaries, repos used as file hosting | `social-handoff` 579 MB with a 96 MB video; render frames, zips | Media over 50 MB never in git (LFS or the laptop); renders, builds and zips stay out of repos (`docs/laptop-folders.md`) |
| Private information, secrets | `yland-secrets.txt` once in a code folder | Secrets never in git (`CLAUDE.md`, Code); a push is preceded by a grep for tokens |

A thread that is unsure whether something violates a row above asks yskills with a card before pushing.

## Throttle (yskills 2026-11-10)

Evidence: 2026-11-10 had 12+ new draft PRs in claude-setup, 12 CI runs in 7 minutes and 5 pushes in 10 minutes to one branch, all under yskills' login. That is the "automated bulk activity" row above, and its spacing rule alone was not kept. GitHub never named the reason for the 2026-10-29 suspension, so a link between the two is a guess; the numbers below are cheap to keep anyway.

1. Per repo, one push per PR branch every 10 minutes at most. Before every push, and before the PR opens, run `node scripts/pre-pr.mjs --body <file>` (all the CI checks), so a push is not followed by a fix push. A red CI mail is only acceptable when the failure cannot be seen locally.
2. The PR body is written to a file first and complete when the PR opens: the `Prior art:` and `Lessons:` lines (`scripts/pr-lessons-check.mjs`) were the cause of 11 red runs on 2026-11-10. Fixing the body later is an `edited` re-run and a mail. Drafts are not skipped by CI: the harness opens every PR as a draft and the gate reads the CI result on it.
3. Org-wide at most 4 new PRs per hour (the coordinator counts). A fifth waits or is batched (Batching small changes).
4. Same-minute bursts are batched: a thread with several small changes makes one PR, not one per change.
5. A failed CI run is fixed in one push after reading the log; no trial pushes.
6. Manual workflow dispatches (`new-project`, `build-logs`) are not retried until the cause in the log is fixed (a Cloudflare GitHub app link, a token), then run once.

## Batching small changes

Pushes and merges are spaced out (table above), so a small change that need not ship now (a doc tip, a lesson line, a typo) is not its own PR:

1. Commit it on the thread's branch as usual.
2. `git format-patch origin/main..HEAD -o /mnt/project-files/<project>/batch/<repo>/` (one patch per commit), make the tree clean (`git status --porcelain` empty: commit, stash or delete leftovers such as screenshots), then `git switch --detach origin/main`.
3. Reply with `Batched: <patch path>` instead of a PR link.

Why step 2: the cloud's own stop hook (`~/.claude/stop-hook-git-check.sh`, platform code, not in this repo) tells a thread to push whenever the checked-out branch has unpushed commits or the tree is dirty. A clean detached checkout passes it (tested 2026-11-08); a dirty or untracked file still trips it, and the patch in project files outlives the container. If the hook still fires, answer in one line, `batched at <path>, not pushing (docs/github-rules.md, Batching small changes)`, and end the turn; it does not fire twice in a row.

The next thread that opens a PR on that repo first applies every patch in that folder (`git am`), names them in its PR body and deletes them after the merge. A patch older than a day goes into the next PR the coordinator starts on that repo.
