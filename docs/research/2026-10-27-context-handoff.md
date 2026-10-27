# When a thread hands off: one number, by size, or auto-compaction (2026-10-27)

yskills asked whether ~200k is right for every task, whether big tasks should go further, or just keep going on auto-compaction. (thread `cmsg_01XKnLb2nhGBYoEt3HNp26NSRYerNv1v6PFFaCvjWVLRcj`, inferred from his message).

## Verdict

- Partly right. A fixed number is wrong for both ends: an S task at 250k is stuck, an L task (a long debug, one big refactor) loses the most when its state moves to a file. The guard now reads `Size:` from the spawn brief ([context-guard.mjs](../../global/context-guard.mjs)).
- The "200k" was the old guard (150k warn, 200k hand off, [token diet 2026-10-07](../token-diet/2026-10-07.md)); PR 221 moved it to 250k/350k ([memory archive INDEX](../archive/claude-setup-memory-2026-10-25/INDEX.md)).
- Auto-compaction as the plan: no. On a 1M window it fires near the end of the window (about 83%, reported, [claudefa.st](https://claudefa.st/blog/guide/mechanics/context-buffer-management)), so a thread would pay 500k-800k per call before it; on some versions it fires early or ignores the override ([issue 53801](https://claudeissues.com/issue/53801-claude-autocompact-pct-override-not-honored-on-opus-4-7-1m-auto-compact-fires-at), [issue 42375](https://claudeissues.com/issue/42375-auto-compaction-triggers-at-6-context-usage-on-opus-4-6-1m-context)). It stays the safety net; the guard caps a brief at 800k so ours comes first.

## Evidence

| Question | Finding | Source |
|---|---|---|
| Window | Every current model we use (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5) has 1M tokens | claude-api skill model table (cached 2026-10-06), inferred from `claude-opus-5-5[1m]` in our session config |
| Long-context price | No premium above 200k on the 5.x models (the 2x tier was Sonnet 4); Haiku 5.5 costs 5x above 100k | claude-api skill model table; [Sonnet 4 1M pricing](https://simonwillison.net/2025/Aug/12/claude-sonnet-4-1m) |
| What a call costs | Each call re-reads the whole context; cache reads were 98% of our usage; Opus 5.5 cache read $0.20/M, so a 350k call is $0.07 and a 500k call $0.10 | `/mnt/project-files/claude-setup/audit/2026-10-18-token-start-cost.md:31`, `/mnt/project-files/claude-setup/SOTA-CHECK.md:22`, claude-api skill model table |
| Cost of a hand-off | A fresh project thread starts at ~114k plus re-reading, so continuing past ~350k pays back the hand-off within a few calls when many steps remain | `/mnt/project-files/claude-setup/audit/2026-10-18-token-start-cost.md:3`, inferred |
| Quality | Accuracy drops as input grows, even on simple tasks ("context rot") | [Chroma, Context Rot](https://research.trychroma.com/context-rot) |
| Anthropic guidance | Context is a finite resource; long tasks use compaction, structured notes outside the context and subagents | [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| Proven harness | Long agents work in fresh sessions, each reading a progress file and git log, one feature per session; compaction alone "isn't sufficient" | [Effective harnesses for long-running agents](https://anthropic.com/engineering/effective-harnesses-for-long-running-agents) |

## Policy (built)

- Hand-off by the brief's `Size:` (S 250k, M 350k, L 500k; warn at 200k, 250k, 350k), in [context-guard.mjs](../../global/context-guard.mjs) `LIMITS`.
- A brief line `Handoff: at <N>k` overrides it for one thread, capped at 800k ([briefs.md](../../.claude/skills/operator/briefs.md)).
- At the hand-off the guard asks for the hand-off file and PR, then nags every 50k; it never blocks, so a step is never cut mid-way ([context-guard.mjs](../../global/context-guard.mjs)).

## What would change the answer

- A long-context premium on the 5.x models, or a weekly limit that counts long calls extra: lower L ([pricing](https://docs.claude.com/en/docs/about-claude/pricing)).
- Measured hand-off losses (a fresh thread redoing work) on L tasks: raise L; measured quality drops on our threads past 300k: lower it ([Context Rot](https://research.trychroma.com/context-rot)).
- Claude Code letting a cloud thread compact on demand after writing its hand-off file: then compaction plus the file could replace the fresh thread (inferred).

## Sources

- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://research.trychroma.com/context-rot
- https://claudefa.st/blog/guide/mechanics/context-buffer-management
- https://claudeissues.com/issue/53801-claude-autocompact-pct-override-not-honored-on-opus-4-7-1m-auto-compact-fires-at
- https://simonwillison.net/2025/Aug/12/claude-sonnet-4-1m

Not checked:
- The Context Rot and context-engineering pages were not reopened this session (cloud threads do not WebFetch); their claims are as widely cited.
- Claude Code's current auto-compact threshold on this exact version.
