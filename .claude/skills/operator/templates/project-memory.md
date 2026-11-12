Rules live in yverse-studio/claude-setup (`CLAUDE.md`, `docs/MAP.md` Start here). Nothing in this file is a rule.

## Goal

The goal, the deadline and the money line, in two or three lines.
Example: Ship Butzis-Spiel on Google Play by 2026-11-30; no live-money step without a tap.

## Masterplan

The one living plan (`roles/project-manager.md`, Masterplan): every item from now to the goal, in
order. One line each: `- [status] <id> <title> · <owner> · <evidence or what it waits on>`.
Status: `todo`, `doing`, `wartet` (on whom), `done` (needs a link), `drop` (says why). Ids never reused.
Example:
- [done] M1 Shop checkout · [Programmer · checkout](#cmsg_x) · PR 14 merged
- [doing] M2 Play listing · [Programmer · store](#cmsg_y) · since 2026-11-12
- [wartet] M3 Domain · yskills · his hands, asked 2026-10-20
- [todo] M4 Launch video · - · after M2
Done before 2026-11-05: M0

## Live

Live projects and their links, one line each.
Example: Company XY, https://company-xy.yverse.workers.dev, live since 2026-10-12.

## Products

This project's repos and where each one's lessons file is.
Example: yverse-studio/company-xy, lessons in `docs/LESSONS.md`.

---
Under 5 KB. Every event updates the Masterplan in the same turn (read_memory, change, update_memory);
threads change only their own item line. A rule found here becomes a `loop:setup` issue
(`docs/MAP.md`, Start here).
