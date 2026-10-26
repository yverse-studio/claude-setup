# Permissions: what may stop a thread, and the way around each stop

yskills (2026-10-26): "run everything without me except for money or really big stuff". This page is
the one home of how that is set up. The ask rule itself (what needs yskills) is in `CLAUDE.md`
(How to work); the settings live in `global/settings.json`.

## The only things that wait for yskills

Real money (live key, purchase, ads, paid plan), a new paid service, deleting data or a repo
(a project needs his "delete <name>"), force-pushing `main` (denied outright), rotating a production
secret, and sending mail or posts publicly. Everything else runs, and a card for any other choice
goes on with its recommendation (`CLAUDE.md`, Cards).

## Layer 1: our own rules

No file in this repo may add a wait beyond the list above. A refused tool call is reported once in
one line and the thread takes the workaround below; it never sits waiting for an Allow. [advisory]

## Layer 2: Claude Code permission prompts

One source, `global/settings.json`, applied in two places:

| Where | How it gets there | Mode |
|---|---|---|
| Laptop | `install.mjs` merges it into `~/.claude/settings.json` (`allow` and `deny` add up; `ask` and `autoMode` are replaced, so a dropped ask rule really goes; the machine's own `defaultMode` stays) | `acceptEdits` (yskills 2026-10-26): allow rules still apply, so the listed commands don't prompt; anything else does |
| Cloud threads | `cloud/setup.sh` writes `permissions` and `autoMode` from main's `global/settings.json` into `~/.claude/settings.json`, and a SessionStart hook re-syncs them from main at every session start, so a merged change needs no environment rebuild | `auto` (the thread's own mode) |

What the file holds and why (docs: code.claude.com permissions, permission-modes, auto-mode-config,
read 2026-10-26):

- **allow**: narrow rules for routine work (git, gh, npm scripts, node checks, the GitHub and remote
  MCP tools incl. merge, workflow dispatch, `add_repo`). An allow rule resolves at once, without the
  auto-mode classifier. Broad rules (`Bash(*)`, `Bash(node *)`, `Bash(npm run *)`) are dropped by
  auto mode, so the list names commands one by one. A compound command needs every part allowed.
- **ask**: always prompts, even in auto mode, so it holds only the list above (publish to npm,
  `wrangler delete` / `d1 delete` / `r2 bucket delete`, `wrangler secret`, `gh repo delete|edit`,
  `delete_file`, `create_repository`).
- **deny**: secrets files, `wrangler login`, force-push or delete of `main`/`master`, and local
  deploy commands (deploys go only through Workers Builds: a deny answers at once, an ask would stall).
- **autoMode**: read from user settings only (never from a repo's `.claude/settings.json`). It keeps
  `"$defaults"` in every list (without it the built-in blocks vanish) and adds the org, our domains,
  the standing approval, and allow lines for the gated merge, setup-repo edits on a branch, routine
  GitHub writes and a verified replace.

Tested in a cloud thread 2026-10-26: a deny rule written into `~/.claude/settings.json` took effect
in the running session at once, so user settings are read there (the settings page says they are
not; the test wins).

## Layer 3: Claude's own safety check

The classifier and the harness can still refuse. These are not ours to switch off; each has a fixed
way around so it never stalls work. Never reword, split or retry a refused call. [advisory]

| Refusal | How often | Way around |
|---|---|---|
| Force-push (any branch) | rare: after a rebase | Never rebase a pushed branch: `git merge origin/main`, or push to a new name (`<branch>-2`) and open a fresh PR |
| Branch delete from a cloud thread (403) | every merged PR | `branch-cleanup.yml` archives and deletes merged branches; nobody deletes by hand |
| Actions re-run from a cloud thread (403) | per flaky CI | Push the real fix, or dispatch the workflow (`actions_run_trigger`) |
| `git reset --hard` | rare | `git merge --ff-only origin/<branch>` or `git stash` then `git checkout` |
| Edit to a permission file (`global/settings.json`, `.claude/settings.json`, `cloud/setup.sh`) | once per change of this page | yskills' explicit "yes, change the permission files" in the thread (a card), then the same edit once more |
| Reading secrets (`.env`, tokens) | never needed | Secrets stay in Actions and the Worker; a workflow uses them |
| WebFetch of a link nobody posted (cloud) | per research | WebSearch instead (`roles/researcher.md`) |
| Writes to `.git/`, `.claude/` | rare | Always classifier-checked by design; the autoMode allow lines cover the normal case |

## Lessons

- 2026-10-26: running `install.mjs` in a cloud thread without `--skip-hooks` writes the ECC hooks into the thread's real `~/.claude` (the ECC installer ignores `CLAUDE_CONFIG_DIR`); test it with `--skip-plugins --skip-hooks`.
- 2026-10-26: the first edit of `global/settings.json` for this page was refused as
  Self-Modification although yskills had asked for it in general words. The classifier wants the
  permission change itself named by him; a card with that exact question is the route.
