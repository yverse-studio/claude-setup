# Tech traps

Short facts that cost a thread a round once. One line each: the trap, the fix, the home of the detail.

- **Pushed migration:** never rename or edit one; add a new one. The rule and the exception live in [`publish`](../.claude/skills/publish/SKILL.md) (migrations), nowhere else.
- **Metricool drafts, UNVERIFIED LEAD** (Social app, 2026-10-26): the `draft` field exists in the connector schema; Social reports that `createScheduledPost` with `draft: true`, called from the Worker through an OAuth MCP client, cancels without a paid plan. Not re-tested here: test on the account before relying on it. Other Metricool limits: [`social-team/learnings.md`](../.claude/skills/social-team/learnings.md).
