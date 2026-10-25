---
name: test-runs-plan
description: Test runs per project type before real projects (approved 2026-10-05): game, then ad campaign posted for real, then AI app; each writes a toolbox playbook
metadata:
  type: project
  modified: 2026-10-05T06:38:25.580Z
---

yskills wants Claude to do a small test run of each project type so real projects reuse the decisions. Plan: /mnt/project-files/test-runs/PLAN.md (approved via cards 2026-10-05 06:38).

- Run 1 browser game (Phaser, Workers, house ad, 6 € test Plus), run 2 social ad campaign for that game, run 3 small AI-feature app. Website = duo-test, no new run.
- Run 2 is posted for real (card "Post it"): yskills connects one TikTok or Instagram account; nothing posts before they've seen the batch once; no paid ads.
- Each run writes `.claude/skills/toolbox/playbooks/<type>.md` in claude-setup (run 1 also writes website.md from duo-test); yskills merges those PRs.
- One fresh thread per run. Repo creation and publishing follow the "Auto merge and publish" thread. Related: [[merge-rule-until-launch]], [[game-and-3d-tools]].
