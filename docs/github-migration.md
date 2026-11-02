# GitHub owner migration (plan B)

Only if GitHub support refuses to unsuspend the account. Nothing here creates an account or pushes by itself.

## Scripts (`scripts/migration/`, run on the laptop, Node only)

1. `node scripts/migration/inventory.mjs C:\Users\Claude\Documents C:\Users\Claude\_backup-bundles-2026-10-29 --out inventory.json`
   lists every clone and bundle, runs `git bundle verify`, and names per repo where the newest state is (unpushed commits and dirty files shown).
2. `node scripts/migration/migrate.mjs --inventory inventory.json --to <new-owner>` is a dry run; add `--run` to create the private repos and push all branches and tags. `--only a,b` limits it.

Dirty files are not copied: commit them first. A repo with `NO USABLE SOURCE` has no clone and no good bundle.

## Steps for yskills (about 10 minutes)

1. Make a new GitHub account or org (name: `<new-owner>`), then on the laptop `gh auth login` as that account.
2. Run the two scripts above (inventory, dry run, then `--run`).
3. Install the Claude GitHub App on the new owner: https://github.com/apps/claude/installations/select_target and reconnect GitHub at https://claude.ai/connect-github.
4. Tell Claude the new owner name; Claude then does the rest below in one PR.

## What points at the old owner (Claude fixes after step 4)

- `yverse-studio` is hardcoded in: `global/rule-guard.mjs`, `global/team-guard.mjs`, `cloud/setup.sh`, `cloud/bootstrap.sh` (raw.githubusercontent.com URLs; **every cloud session loads its guards from there**, so claude-setup must move first), `global/settings.json`, workflows `new-project`, `delete-project`, `branch-cleanup`, `delete-helper-branch`, scripts `new-project.mjs`, `delete-project.mjs`, `project-instructions.mjs`, `deploy-watch.mjs`, `journey.mjs`, and `projects/*.json` (`org`).
- Hands only: new `PROJECTS_GITHUB_TOKEN` (fine-grained, PR Read, Commit statuses RW, Checks Read) plus the Actions secrets and variables in the new claude-setup; Cloudflare Workers Builds connection of every Worker (dashboard, Workers > Settings > Builds > reconnect to the new repo); project repo list in Claude Project settings; the two routines (weekly repo audit, loop reader); laptop remotes (`git remote set-url origin ...`); Project instructions text.
- Not on GitHub, nothing to do: Cloudflare Workers themselves, Stripe, domains.

## What could have triggered the suspension (checked 2026-11-01, a guess, GitHub gives no reason)

- In the repo nothing looks abusive: one cron (`deploy-watch`, every 15 min, a few API reads and at most one issue per drift), the other workflows run by hand. No loops.
- More likely from outside the repo: many repos and PRs created by the account's tokens in a short time (new-project runs, the claude-setup PR flood of 300+ PRs), a fresh or second account working through one token, or a payment or ToS check. Ask support for the reason in the appeal and say: solo developer, own repos, AI-assisted workflow, no spam, no scraping.
- If the org `yverse-studio` is still reachable by another account, make that account an Owner (Org settings > People) before anything else; the repos then stay where they are and only the owner token changes.
