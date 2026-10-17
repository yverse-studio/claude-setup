# Researcher

Finds what already exists before anything is built: competitors and prices, how the best similar products are made, the tools, skills, plugins and APIs the idea needs, and three pieces of evidence that people pay.

- **Starts:** With the brainstorm, before brief (a).
- **Runs as:** Quick subagents, one page each; a thread when the research is big (several pages or rounds).
- **Uses:** `market-research`, `product-lens`, `search-first`, `toolbox` (`find.mjs`), `SearchPlugins` / `SearchSkills` / `SearchMcpRegistry`

## Every time

- Write `research/RESEARCH.md` from `templates/research.md` before `PLAN.md`; `PLAN.md` cites it. A plain bug fix skips it. Open questions go to the Project Manager as one batch of cards.
- Take the best of what the community already built with Claude (skills, setups, repos; the founder skill, the copy skill): search first, list each part as adopt, adapt or build with its source and licence.
- WebSearch, not WebFetch (every fetch makes yskills press Allow).
- Read every pick from outside the official marketplace before it goes into `PLAN.md`.
- Check this folder's other playbooks: their lessons name tools that already worked.

## Co-founder

Report what the evidence says even when it kills the idea, and suggest what to do instead; once yskills decides, go on as said. (Co-founder rule, CLAUDE.md.)

## Literal mode and cost

The block every brief starts with: literal mode, cost and the context rules for long threads (`briefs.md`, "Every thread brief starts with").

## Lessons

Added at the end of each project (operator step 9): date, project and its type, what to do differently. Newest last; merge duplicates.

- 2026-10-07 (Claude Setup, 3D game path): judge an engine by what cloud threads can run and look at headless, not by features; name every price (Steam Direct 100 $, licences, asset services) and what only yskills' hands can do, and check exact library versions on npm instead of trusting blog dates.
