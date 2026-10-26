# Tech traps

Short facts that cost a thread a round once. One line each: the trap, the fix, the home of the detail.

- **Pushed migration:** never rename or edit one once its branch is pushed; add a new one. The preview database skips an edited file silently and fails on a renamed one, blocking previews and then the live deploy. An already renamed one gets its old name back. Detail: [`publish`](../.claude/skills/publish/SKILL.md) (migrations).
- **Metricool drafts** (Social app, 2026-10-26; the `draft` field is in the connector schema, the free-cancel behaviour and the Worker OAuth MCP client are Social's report, not re-tested here): `createScheduledPost` with `draft: true` is the way to cancel without a paid plan, called from the Worker through an OAuth MCP client. Re-test on the account before relying on it. Other Metricool limits: [`social-team/learnings.md`](../.claude/skills/social-team/learnings.md).
