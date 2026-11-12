# Masterplan: how long-running agents keep ONE living plan (SOTA 2025-26)

Read 2026-11-12 via rule-guard read (full page text) unless marked. `inferred` = my guess, not in the source.

Taken (2026-11-12, `inferred`): first the plan went into `MEMORY.md` (#430, the coordinator can write only memory); the same day yskills picked `PLAN.json` written by threads, as recommended below, with `scripts/plan.mjs` as the only writer and the coordinator as reader; the rest (roadmap first, status words, done needs a link, stall rule, fixed Stand answer) is adopted as recommended below. Rule: [`roles/project-manager.md`](../../.claude/skills/operator/roles/project-manager.md) (Masterplan).

## Per source

**1. Anthropic, Effective harnesses for long-running agents (Nov 26 2025)** [link](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Two failure modes: agent tries to one-shot everything and runs out of context mid-feature; later agent "see[s] that progress had been made, and declare[s] the job done." Same page. ([source 1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
- Fix: initializer session writes `init.sh`, `claude-progress.txt` (log of what agents did) and a git commit; then every session does one feature and leaves "structured updates." Same page. ([source 1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
- Feature list: initializer expands the prompt into a "comprehensive file of feature requirements" (200+ for their example), all initially `"passes": false`; agents may edit only the `passes` field. "We landed on using JSON ... the model is less likely to inappropriately change or overwrite JSON files compared to Markdown." Same page. ([source 1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
- Session start ritual: read progress file + git log, read feature list, pick highest-priority unfinished item, run a smoke test. Same page. ([source 1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
- Premature "done" is fixed by "only mark features passing after careful testing" (end-to-end, browser tool). Same page. ([source 1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
- Verdict: **ADOPT** (full roadmap up front, per-item status, JSON, status-only edits, start/end ritual). **ADAPT** `passes` boolean to a 4-value status for us. ([source 1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))

**2. Anthropic, Effective context engineering (Sep 29 2025)** [link](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Structured note-taking = notes "persisted to memory outside of the context window" and pulled back later; "Like Claude Code creating a to-do list, or ... a NOTES.md file ... track progress across complex tasks." Same page. ([source 2](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
- Context is "a finite resource," attention budget depletes with every token. Note-taking "excels for iterative development with clear milestones." Same page. ([source 2](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
- Verdict: **ADOPT** as the principle: plan lives outside the chat, is re-read in. ([source 2](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

**3. Anthropic, multi-agent research system** [link](https://www.anthropic.com/engineering/multi-agent-research-system)
- LeadResearcher "saving its plan to Memory ... since if the context window exceeds 200,000 tokens it will be truncated and it is important to retain the plan." Same page. ([source 3](https://www.anthropic.com/engineering/multi-agent-research-system))
- Long-horizon: agents "summarize completed work phases and store essential information in external memory," then fresh contexts get "careful handoffs" and "retrieve stored context like the research plan." Same page. ([source 3](https://www.anthropic.com/engineering/multi-agent-research-system))
- Verdict: **ADOPT**: plan is saved first, before any worker starts; a new session reads it instead of the chat. ([source 3](https://www.anthropic.com/engineering/multi-agent-research-system))

**4. Claude Code docs: plan mode, tasks, memory** [plan mode](https://code.claude.com/docs/en/common-workflows), [memory](https://code.claude.com/docs/en/memory)
- Plan mode: "Claude reads files and proposes a plan but makes no edits until you approve." common-workflows page. ([source 4](https://code.claude.com/docs/en/common-workflows))
- Memory: MEMORY.md is an index, "one line per memory"; only first 200 lines or 25KB load; near the limit Claude is told to "keep one line per entry, move detail into topic files, and merge or drop stale entries"; past the limit "everything past the limit is dropped on the next load." memory page. CLAUDE.md target "under 200 lines." Same page. ([source 4](https://code.claude.com/docs/en/common-workflows))
- Task list persistence (`CLAUDE_CODE_TASK_LIST_ID` shares one list across sessions, stored under `~/.claude/tasks/<id>/`): only third-party blogs and a source dump found, e.g. [claudefa.st](https://claudefa.st/blog/guide/development/task-management) (WebSearch snippet only; official docs pages I read do not mention it). Treat as unverified.
- Verdict: **ADOPT** the memory size rule (index + topic files, hard line cap); **SKIP** task-list env var (Claude Code CLI feature, our coordinator is a claude.ai chat; also unverified). ([source 4](https://code.claude.com/docs/en/common-workflows))

**5. Manus, Context Engineering (Jul 2025)** [link](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- "it tends to create a todo.md file ... and update it step-by-step ... checking off completed items"; typical task "around 50 tool calls"; "By constantly rewriting the todo list, Manus is reciting its objectives into the end of the context," avoiding lost-in-the-middle drift. Same page. ([source 5](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus))
- Caveat (secondary, [ZenML summary](https://www.zenml.io/llmops-database/context-engineering-strategies-for-production-ai-agents), snippet only, unverified): early version spent ~1/3 of actions on todo updates.
- Verdict: **ADAPT**: recite by re-reading the plan at every session start and after every event, but update only on real events (not every step), so cost stays small. ([source 5](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus))

**6. Microsoft Magentic-One (arXiv 2411.04468)** [paper](https://arxiv.org/abs/2411.04468), [AutoGen docs](https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/magentic-one.html)
- PDF text not extractable here; the following is from WebSearch snippets of secondary summaries ([Azure Labs](https://labs.ai.azure.com/innovations/magentic-one/), [agentpatterns.ai](https://agentpatterns.ai/patterns/multi-agent/magentic-orchestration/)): outer loop keeps a Task Ledger (plan, verified facts, facts to look up, educated guesses); inner loop keeps a Progress Ledger (is task done, stuck in loop, making progress, next agent + instruction); a stall counter rises when no progress, and after a small threshold (about 2) the orchestrator updates the ledger and makes a new plan.
- Verdict: **ADAPT**: two layers in one file: stable "Plan/Facts" and fast-changing "Status"; add a stall rule: an item with no event for N sessions is flagged `blocked`/re-planned, not silently carried. N = `inferred` (2).

**7. Cursor, agent best practices** [link](https://cursor.com/blog/agent-best-practices)
- "The most impactful change you can make is planning before coding." Plan Mode produces a reviewable plan as Markdown the human can edit; "Save to workspace" stores it in `.cursor/plans/` which "makes it easy to resume interrupted work, and provides context for future agents." Same page. ([source 7](https://cursor.com/blog/agent-best-practices))
- Verdict: **ADOPT**: plan is a file in the repo, human-editable, shared with every future agent. ([source 7](https://cursor.com/blog/agent-best-practices))

**8. Cline Memory Bank** [link](https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets)
- Files: `projectbrief.md` (source of truth) > `productContext.md` > `activeContext.md` ("Current state of development") + `progress.md` ("Project status and tracking"); agent "Read all Memory Bank files" at every task start because "Every time you start a new chat, your context window fills up or resets." Same page. ([source 8](https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets))
- Verdict: **ADAPT**: split slow (brief) from fast (active/progress) is right; but 6 files is too many for a read-only coordinator; we keep one file with two zones. (Fit to our setup = `inferred`.)

## Patterns that recur
- Plan written once, up front, before work, and stored outside the context window. Sources 1, 3, 7. ([1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [3](https://www.anthropic.com/engineering/multi-agent-research-system), [7](https://cursor.com/blog/agent-best-practices))
- Per-item status, small fixed vocabulary; everything starts "not done." Source 1 (`passes:false`). ([1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
- Agent reads the plan file first in every session and writes it last. Sources 1, 5, 8. ([1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [5](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus), [8](https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets))
- Recitation: plan re-enters recent context so it is not forgotten. Source 5, 8. ([5](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus), [8](https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets))
- One item at a time, evidence before "done" (end-to-end test). Source 1. ([1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
- Machine-edit-safe format (JSON) for status; prose only for the human-facing part. Source 1. ([1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
- Replan on stall, do not push on. Source 6. ([6](https://arxiv.org/abs/2411.04468))
- Memory is an index with a hard cap; detail lives in topic files. Source 4. ([4](https://code.claude.com/docs/en/common-workflows))

## Recommendation for our coordinator
- File: one `PLAN.json` in the project repo (claude-setup or the project), plus `NOW.md` already exists as live board (CLAUDE.md names it; `inferred` it is the human view). JSON for items, because Source 1 says models corrupt Markdown more often.
- Shape: `{goal, updated, items:[{id, title, status, owner_thread, evidence, next, blocked_on}], decisions:[], asks:[]}`. Keep `goal` + `decisions` slow, items fast. (Task/Progress Ledger split, Source 6.) ([6](https://arxiv.org/abs/2411.04468))
- Status values: `todo | doing | blocked | done`; `done` requires an `evidence` link (PR, test, live URL). Source 1 (premature done). ([1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
- Roadmap first: the Planner writes the full item list before any worker starts, like plan mode; coordinator may only append items or change status, never delete or reword. Sources 1, 3, 7. ([1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [3](https://www.anthropic.com/engineering/multi-agent-research-system), [7](https://cursor.com/blog/agent-best-practices))
- Who writes: coordinator has no Write/Bash (given), so the worker thread that finishes an event writes its own item's status in the same PR/commit as its work; coordinator reads. `inferred` from the tool constraint; avoids Manus's cost of the lead doing all bookkeeping (Source 5 caveat).
- When updated: on every event (thread started, PR merged, blocker, decision), never on a timer. At session start the coordinator reads PLAN.json before anything else (recitation, Sources 1, 5). ([1](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [5](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus))
- On-demand "Stand + nächste Schritte": built only from PLAN.json, fixed shape: 1 line goal; counts (done/doing/blocked/todo); the `doing` items with owner; the `blocked` items with what is needed from him; next 3 `todo` items. If the file is stale (`updated` older than newest merged PR), say so. Format `inferred`; fits the 15-line reply limit in CLAUDE.md.
- Ping rules (`inferred`; no primary source covers human-pinging, Sources 1-8 are silent): ping only on (a) item `blocked_on: human`, (b) a finished part with a live link, (c) something visual to rate (screenshot link, one card), (d) a question that changes the plan (a card). No ping for progress inside an item. Batch into one message.
- Memory: state only, index form (Source 4): current project, pointer to PLAN.json, 1 line per standing fact, hard cap well under 200 lines; no status, no history, no plans. Status lives only in PLAN.json, history in git. Stale lines merged or dropped on every write. ([4](https://code.claude.com/docs/en/common-workflows))
- Stall rule: item `doing` with no event over 2 sessions becomes `blocked` with a reason, and the coordinator reports it (Source 6, threshold `inferred`).

Not checked:
- Claude Code official docs for TaskList persistence / `CLAUDE_CODE_TASK_LIST_ID`: not in the official pages I read (common-workflows, interactive-mode, memory); only third-party blogs.
- Magentic-One paper full text: PDF binary not readable via the read tool; used WebSearch snippets of secondary summaries.
- Devin and OpenAI Codex plan/progress practice: not searched (time); no primary source read.
- Public Claude setups (e.g. community "memory bank" repos): not read; only Cline's official blog.
- Human-ping best practice: no primary source found; rules above are my inference.


## Sources

- 1: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- 2: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- 3: https://www.anthropic.com/engineering/multi-agent-research-system
- 4: https://code.claude.com/docs/en/common-workflows
- 5: https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
- 6: https://arxiv.org/abs/2411.04468
- 7: https://cursor.com/blog/agent-best-practices
- 8: https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets
