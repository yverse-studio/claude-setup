# Research: one source of truth for rules and lessons across Claude sessions (2026-10-25)

## 1. CLAUDE.md, auto memory, claude.ai Projects (official)

Claude Code (https://code.claude.com/docs/en/memory)
- Two mechanisms: "CLAUDE.md files: instructions you write" and "Auto memory: notes Claude writes itself". Both load every session; "Claude treats them as context, not enforced configuration. To block an action ... use a PreToolUse hook instead." (https://code.claude.com/docs/en/memory)
- Size: "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence." Hard limit: whole file loads if 4 MiB or smaller; larger is skipped entirely. (https://code.claude.com/docs/en/memory)
- Imports: `@path`, relative to the importing file; "maximum depth of four hops" (a third-party search summary said five; the doc says four). "Imports help you organize a long file but don't reduce its context cost, because imported files load together with the CLAUDE.md that imports them." (https://code.claude.com/docs/en/memory)
- Block-level HTML comments in CLAUDE.md are stripped before injection (free maintainer notes, e.g. dated provenance). (https://code.claude.com/docs/en/memory)
- Hierarchy: user `~/.claude/CLAUDE.md`; project `./CLAUDE.md` or `./.claude/CLAUDE.md`; local `./CLAUDE.local.md` (gitignore); managed org file. Files from filesystem root down to cwd are concatenated, not overridden; closer ones are read last. Subdirectory CLAUDE.md load on demand. `claudeMdExcludes` skips files. "if two instructions contradict each other, Claude may pick one arbitrarily." (https://code.claude.com/docs/en/memory)
- User vs project rule conflict: "Neither set overrides the other ... Claude may follow either one." (https://code.claude.com/docs/en/memory)
- `.claude/rules/*.md`: no `paths` frontmatter = loaded at launch; with `paths` = loaded when Claude reads a matching file. `paths` is the only frontmatter field read. Symlinks supported to share a rules set across projects (external targets need approval). (https://code.claude.com/docs/en/memory)
- AGENTS.md: read directly only if NO CLAUDE.md exists in cwd or above (v2.1.277+). If both exist, "Your CLAUDE.md files only". Documented single-source pattern: CLAUDE.md containing `@AGENTS.md` plus Claude-only lines; or `ln -s AGENTS.md CLAUDE.md` (not on Windows; Edit/Write refuse to write through a symlink). Setting `claude-md-and-agents-md` loads both. (https://code.claude.com/docs/en/memory)
- Audit: `/doctor prompt-audit` finds "instructions written for older models, references to files or commands that don't exist, and files that contradict each other"; report only, nothing changes until you ask. Covers CLAUDE.md, CLAUDE.local.md, AGENTS.md, plus rules, skills, commands, subagents, output styles under `.claude/` and `~/.claude/`. (https://code.claude.com/docs/en/memory)
- Auto memory: on by default locally. Dir `~/.claude/projects/<project>/memory/`, `<project>` derived from the git repo, shared by all worktrees of that repo. "Machine-local ... Files are not shared across machines or cloud environments." Layout: `MEMORY.md` index (one line per memory) + topic files (user_role.md, feedback_testing.md). "The first 200 lines of MEMORY.md, or the first 25KB, whichever comes first, are loaded at the start of every conversation"; topic files are read on demand. Over the limit: write succeeds, error tells Claude to rewrite the index. Memory dir is excluded from cleanupPeriodDays sweep. (https://code.claude.com/docs/en/memory)
- Off / elsewhere: `/memory` toggle (saves `autoMemoryEnabled` in `~/.claude/settings.json`); `"autoMemoryEnabled": false` per project; env `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`; `"autoMemoryDirectory": "~/my-custom-memory-dir"` (absolute or `~/`, any settings scope). Main conversation's auto memory is NOT loaded into subagents. (https://code.claude.com/docs/en/memory)

claude.ai / Claude Code "Projects" (coordinator + threads) (https://code.claude.com/docs/en/claude-projects)
- Public beta on Pro and Max; "Projects aren't offered on Team or Enterprise plans yet." (https://code.claude.com/docs/en/claude-projects)
- Project instructions: "Text sent to each new thread and to Claude in the project conversation, up to 16,000 characters." Edit in Project settings > Memory > Project instructions. (https://code.claude.com/docs/en/claude-projects)
- Project memory: "Every cloud thread reads the index file MEMORY.md when it starts and opens the other files when it needs them." Editable in Project settings > Memory. "separate from the auto memory Claude Code keeps on your machine, even though both use a MEMORY.md index" and "separate from the CLAUDE.md files in the project's repositories." (https://code.claude.com/docs/en/claude-projects)
- Official split: "put instructions about a repository in its CLAUDE.md and notes about the project in project memory." "when you correct a thread, also tell Claude to remember the correction." (https://code.claude.com/docs/en/claude-projects)
- Cloud threads load from each repo only root `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/`. NOT loaded: subdirectory CLAUDE.md, path-scoped rules, `.claude/skills/`, agents, commands, `.mcp.json`, `.claude/settings.json` (permissions, plugins). Skills must be enabled on the claude.ai account instead. (https://code.claude.com/docs/en/claude-projects)
- A thread run on your computer "Starts with the project's instructions, but not with its memory files loaded." (https://code.claude.com/docs/en/claude-projects)
- Memory-bound conversation: the coordinator "works from recent messages, recent threads, and project memory rather than its full history ... Put anything that must never be dropped in project memory." (https://code.claude.com/docs/en/claude-projects)
- Files under `/mnt/project-files` are readable by threads; documents delivered land in the Library tab. (https://code.claude.com/docs/en/claude-projects)
- Plain claude.ai chat Projects (https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects): instructions apply to all chats in the project; RAG mode turns on automatically near the context limit (paid plans); each project has its own memory, not shared with other projects; "Use account memory" toggle; memory deleted with the project. (Exact knowledge size cap not stated by Anthropic in what I read.)

## 2. Skills vs CLAUDE.md (https://code.claude.com/docs/en/skills)
- "Create a skill when you keep pasting the same instructions, checklist, or multi-step procedure into chat, or when a section of CLAUDE.md has grown into a procedure rather than a fact. Unlike CLAUDE.md content, a skill's body loads only when it's used." (https://code.claude.com/docs/en/skills)
- Description: combined `description` + `when_to_use` "is truncated at 1,536 characters in the skill listing". "Put the key use case first." (https://code.claude.com/docs/en/skills)
- "Keep SKILL.md under 500 lines. Move detailed reference material to separate files." Supporting files (reference.md, examples.md, scripts/) load only when needed; scripts are executed, not loaded. (https://code.claude.com/docs/en/skills)
- Cost: "Every skill in the skill listing adds to your context on every turn"; after load "every line is a recurring token cost". After compaction: first 5,000 tokens of each invoked skill kept, shared budget 25,000 tokens. (https://code.claude.com/docs/en/skills)
- Practical rule: facts and always-true rules = CLAUDE.md/rules; procedures and reference = skills. In cloud/Project threads repo skills do not load (above), so any rule a Project thread needs must be in repo CLAUDE.md, project instructions or project memory. (https://code.claude.com/docs/en/skills)
- HumanLayer (https://www.humanlayer.dev/blog/writing-a-good-claude-md): "Frontier thinking LLMs can follow ~ 150-200 instructions with reasonable consistency"; Claude Code's system prompt has "~50 individual instructions"; "< 300 lines is best"; Claude Code adds "this context may or may not be relevant to your tasks", so the model may skip content it judges irrelevant; "Prefer pointers to copies"; do not auto-generate CLAUDE.md. (Opinion blog, not Anthropic.)

## 3. Public setups

- EveryInc compound-engineering (https://github.com/EveryInc/compound-engineering-plugin; guide docs/guides/ce-compound.md):
  - Write: `/ce-compound` -> `docs/solutions/[category]/[filename].md` (default; `docs_root` in config.yaml moves it). Categories auto-detected (build-errors/, performance-issues/, logic-errors/, architecture-patterns/, conventions/, tooling-decisions/); reuses existing vocabulary. (https://github.com/EveryInc/compound-engineering-plugin)
  - Frontmatter: `module`, `tags`, `problem_type`, `severity`, `resolution_type` (closed enums), `component`, `root_cause`, `last_updated` (added on update), `retire_when` (only for guidance depending on something outside the repo). `scripts/validate-frontmatter.py` checks it. (https://github.com/EveryInc/compound-engineering-plugin)
  - Index/find: no index file; "ce-plan and ce-ideate read that folder as institutional memory"; ce-code-review has a learnings pass; the discoverability check looks at AGENTS.md/CLAUDE.md "to confirm future agents will know to check docs/solutions/". (https://github.com/EveryInc/compound-engineering-plugin)
  - Dedup: Related Docs Finder scores 5 dimensions (problem, root cause, solution, referenced files, prevention). 4-5 match: update same file. 2-3: new doc flagged for consolidation.  (https://github.com/EveryInc/compound-engineering-plugin)
  - Prune: `/ce-compound-refresh` (stale/overlapping learnings); recommended after capture, not run by default. Pruning detail not documented on the pages I read. (https://github.com/EveryInc/compound-engineering-plugin)
- mattpocock/skills (https://github.com/mattpocock/skills): `retro` = "Suggest improvements to the coding agent's environment" after a session, most severe first; `handoff` = "Compact the current conversation into a handoff document so another agent can continue the work." Glossary file (GLOSSARY.md, formerly CONTEXT.md) and ADRs updated inline by grill-with-docs/domain-modeling; save location chosen in `/setup-matt-pocock-skills`. No automatic pruning described.
- obra/superpowers (https://github.com/obra/superpowers): no persistent lessons store described on the README. Has `writing-skills` (create/test skills) and `diagnosing-superpowers` (post-hoc session analysis). Lessons -> skills, not memory.
- BMAD-METHOD: `project-context.md` (default `_bmad-output/project-context.md`) generated by bmad-generate-project-context and auto-loaded by architecture/dev-story/code-review workflows; a newer bmad-project-context writes a small verified block into AGENTS.md (secondary source: https://skillselion.com/skills/bmad-code-org/bmad-method/bmad-generate-project-context). Docs: https://docs.bmad-method.org/
- gsd-build/get-shit-done: repo page says it is archived, moved to open-gsd/gsd-core (https://github.com/gsd-build/get-shit-done); I could not verify its state-file scheme.
- HumanLayer: README did not describe thoughts/ or research_codebase; only lists CLAUDE.md, AGENTS.md, .agents/context-shards, a Research-Plan-Implement plugin (https://github.com/humanlayer/humanlayer). Not verified.
- AGENTS.md convention: stewarded by the Agentic AI Foundation (Linux Foundation); nearest file wins in most tools; Claude Code concatenates instead (secondary sources, e.g. https://www.mintlify.com/agentsmd/agents.md/guides/monorepos). Anthropic's own documented bridge is `@AGENTS.md` in CLAUDE.md (see section 1).
- Common pattern across these: lessons live in the repo as files (git-versioned), CLAUDE.md/AGENTS.md carries only a pointer ("check docs/solutions/"), frontmatter/validator for structure, refresh skill for staleness. (inferred from the EveryInc, mattpocock and BMAD pages above)

## 4. Failure modes and fixes (all from sources above)
- Contradiction: "Claude may pick one arbitrarily" -> run `/doctor prompt-audit` periodically; one home per rule, others link (https://code.claude.com/docs/en/memory).
- Bloat: >200 lines "reduce adherence"; imports do not save context; move to path-scoped rules or skills (same page; skills page). (https://code.claude.com/docs/en/memory) (https://code.claude.com/docs/en/skills)
- Index overflow: MEMORY.md past 200 lines/25KB is silently dropped at load; Claude Code now warns when writing (same memory page). (https://code.claude.com/docs/en/memory)
- Memory split across stores that do not see each other: Claude Code auto memory (machine-local, not shared across machines/cloud), Project memory (cloud only, not loaded on local Remote Control threads), repo CLAUDE.md (read by cloud threads from clone, root only). Only the repo is read by all three, and only git history makes it auditable. (https://code.claude.com/docs/en/memory) (https://code.claude.com/docs/en/claude-projects)
- Advisory not enforced: use hooks/CI for must-hold rules (memory page: PreToolUse hook). (https://code.claude.com/docs/en/memory) (https://code.claude.com/docs/en/claude-projects)
- Stale lessons: compound-engineering's `last_updated`, `retire_when`, refresh skill, validate-frontmatter script are the concrete documented patterns (guide above). Dated entries plus a `retire_when`-style condition are the cheapest. (https://code.claude.com/docs/en/memory) (https://code.claude.com/docs/en/claude-projects)
- Independent finding: Anthropic's own advice for Projects is "correct a thread -> also tell Claude to remember"; that puts lessons in project memory, which is the store that does NOT reach local sessions. A setup wanting one source should treat project memory as a cache and promote lessons to the repo. (https://code.claude.com/docs/en/memory) (https://code.claude.com/docs/en/claude-projects) (https://github.com/EveryInc/compound-engineering-plugin)

Not checked:
- Exact claude.ai chat-Project knowledge size cap (sources conflict; Anthropic number not found).
- Whether Project memory MEMORY.md has the same 200 line/25KB load cap as local auto memory (doc only says threads read the index).
- Project instructions 16,000 chars: from the Projects beta page; chat Projects may differ.
- ce-compound-refresh internals; compound-engineering SKILL.md specs; HumanLayer thoughts/ and research_codebase; GSD (.planning/STATE.md) and BMAD retro mechanics; obra episodic-memory plugin; agents.md official site (all not read in primary form).
- Skill-description total budget across all skills (only the 1,536-char per-skill cap was confirmed; the "Skill descriptions are cut short" section was not read).
- Routines: no primary doc read on what routines load.

## Sources

- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/claude-projects
- https://code.claude.com/docs/en/skills
- https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects
- https://github.com/EveryInc/compound-engineering-plugin
- https://github.com/mattpocock/skills
- https://www.humanlayer.dev/blog/writing-a-good-claude-md
