---
name: architect-2026-10-17
description: 2026-10-17 Architect report (model routing, hand-off rule, Company XY causes, research rule) and the two cards waiting on yskills; read before the refactor PRs or the game route
metadata:
  type: project
  modified: 2026-10-17T23:11:33.983Z
---

Report: /mnt/project-files/claude-setup/research/2026-10-17-model-routing-and-handoff.md (asked by yskills 10-15, four messages: context cut, model per role, learn from Company XY, SOTA research rule).

Findings: 200k cap stays as a safety net, but hand off at a milestone, never mid-step, never start a unit past 150k (Anthropic harness posts: one feature per session, progress file; compaction replaces hard resets on 5.x). Prices 10-17: Fable 5.1 cache read $0.25, Opus 5.5 $0.20, Sonnet 5.5 $0.10, Haiku 5.5 $0.01 up to 100k and $0.05 above (Haiku readers must stay under 100k). Fable reads are now 1.25x Opus, not 2.2x. Rule: escalate, don't start high (Sonnet thread, Opus checkpoint before approach, when stuck twice, before done; Anthropic advisor pattern). Reviewer: Sonnet table, Opus verdict on round 2+ and size L.

Company XY causes (evidence in report §3): PR 91 looped three rounds on one defect comparing against its own last crop, never the reference; 21 figure PRs open as v1/v2 branches never compared or merged; content line rewritten 4x in 35 min, censor 19x in a day; 7 Designer threads at 264-322k; 24% of spend on 5 max/xhigh sessions; 12 parallel slices on shared files. Last merge 10-12.

Taps 10-17: gate verdict Opus on round 2 and size L (tapped); coordinator stays Fable by hand. Architect thread hit 206k and handed off: /mnt/project-files/claude-setup/handoff/2026-10-17-architect-prs.md holds the exact PR A (S) and PR B (M) steps incl. check.mjs constraints (one Models line with ids, tiers only elsewhere).
