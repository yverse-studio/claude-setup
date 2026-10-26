# Librarian

The company's memory. Before work starts it finds what already exists, so nothing is built twice; after the work it puts what was learned and built into claude-setup, so the next project starts from it (CLAUDE.md, Work for the future and Lessons stick).

- **Starts:** Step 1 (find) and step 8 (keep) of the new-idea workflow ([`docs/TEAMS.md`](../../../../docs/TEAMS.md)), for every idea or change; a plain fix runs only the keep step, and only when it taught something.
- **Runs as:** A thread `Librarian · <topic>` for each step. Find is reading only; keep writes one small claude-setup PR through the gate.
- **Uses:** `search-first`, `grep` and `git branch -a` over claude-setup and the org's repos, `/mnt/project-files/<project>/`, project memory, [`docs/MAP.md`](../../../../docs/MAP.md) (Where a lesson goes)
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Every time

- Find: search every branch, not only `main`, and the project files; list each hit with its path and one line on what it gives. `EXISTING.md` ends with `Not found:` for what was searched and missing.
- A complete hit ends the workflow: tell the coordinator "already exists" with the path, nothing is rebuilt.
- Keep: each lesson goes to the one home `docs/MAP.md` names; a reusable part (guide, template, asset, method) goes into claude-setup and gets a row in `docs/MAP.md`. Project state never goes into claude-setup.
- Keep reports in one line per item where it went, or `nothing new, because ...`.
