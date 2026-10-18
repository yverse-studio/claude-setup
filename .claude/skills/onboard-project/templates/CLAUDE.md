# <Project>: notes for Claude

<One or two sentences: what it is, who uses it, where it runs.>

## Layout

- `<dir>`: <what lives there>

## Commands

- `npm run dev`: <url>
- Before pushing, run what CI runs: see the `verify` skill.
- Deploy: <how, and who triggers it>. Never deploy without being asked.

## Rules

- <Security model, e.g. auth approach, CSP, what data is sensitive.>
- App keys are Worker secrets; `.env` (git-ignored) is for local dev only; keep `.env.example` current.
- Docs for the owner are in <German/English>; UI text is <German first, English second>.

## UI work

Screenshot phone and desktop with the `ui-review` skill, run `design-critic`, and put the
screenshots in the PR. <Point to the design doc if there is one.>
