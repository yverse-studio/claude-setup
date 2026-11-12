# Loop limits and hook enforcement in public Claude Code setups (2026-11-12)

Researcher subagent, sources as read. Stars were not shown on any page read and the GitHub API was refused, so no star counts. Feeds the hard gate round counter (`operator/gate.md`, Rounds; `global/gate-rounds.mjs`).

| Source | Mechanism | State | Bypassable |
|---|---|---|---|
| Claude Code hooks docs, https://code.claude.com/docs/en/hooks | PreToolUse exit 2 blocks the call and beats any allow JSON; other exit codes (crash, timeout) do not block. Stop exit 2 or `{"decision":"block"}` sends Claude back to work | none; the hook gets `session_id` and `transcript_path` and keeps its own state | a crashing hook does not block |
| anthropics/claude-plugins-official, plugins/ralph-loop (`hooks/stop-hook.sh`) | Stop hook reads `.claude/ralph-loop.local.md` (iteration, max_iterations, promise), increments, exits 0 at the cap; default 0 = unlimited | local file in the project dir | yes: the model can edit or delete the file or print a false promise |
| obra/superpowers, subagent-driven-development (`references/fix-loop.md`) | 5 rounds per task; rounds 1-3 resume the same implementer, 4-5 a fresh one on a model one tier higher; after 5 the controller adjudicates and stops | progress ledger line per round | yes: prose only; the controller rules on its own, no human card |
| pi-superteam 0.3.0 sdd-workflow | `maxIterations: 3`, `escalateOnMaxIterations: true`: hand to the human after the cap | tool config | not checked in code |
| Anthropic, Building effective agents, https://www.anthropic.com/engineering/building-effective-agents | principle: stopping conditions such as a maximum number of iterations, pause for a human at blockers | none | no mechanism |
| Geoffrey Huntley, https://ghuntley.com/ralph | plain bash loop, plan file, tests as back pressure; no iteration cap found | repo files | no hard cap |
| disler/claude-code-hooks-mastery | PreToolUse exit 2 blocks; Stop payload carries `stop_hook_active` | hook scripts | the flag only says the hook already blocked once |

Leads only (pages not opened): Stop-hook loops of ~50 minutes and a built-in cap of about 8 consecutive Stop blocks. Not checked: everything-claude-code on loops, Boris Cherny, Simon Willison.

## What we copied and what we avoided

- Copied the schedule of superpowers (rounds 1-3 same worker, higher tier from round 4, hard stop after): ours is 3 rounds, a Fable director for rounds 4-6, then one card to yskills.
- Copied the counter-as-data idea of ralph-loop, but not its state: ours is a ledger per asset in the shared project folder, written only by `gate-rounds.mjs`, with Write/Edit/Bash edits refused by the hook, and no unlimited default.
- Fail closed (hooks docs: a crash does not block): the gate paths in `rule-guard.mjs` refuse the call when the ledger check throws.
- The orchestrator's own actions (gate post, merge, thread brief) are checked, not only the builder's.
- Round 7 needs a signal the model cannot forge: the hook checks the card id appears in the session's `request_decision` result; `waive` also needs yskills' own reply in the session. We did not copy superpowers' final step where the controller rules by itself.
- Known gap, said in gate.md: the ledger is in the project folder (one project's threads share it) and the project chat has no hooks; a CI-written counter (PR label by an org-token workflow) would close it and is the next step if the hook proves too weak.
