---
name: cloud-thread-plugins
description: Plugins from claude-setup DO load in cloud threads (seen 2026-10-03), but Context7 is blocked by the cloud network proxy
metadata:
  type: project
  modified: 2026-10-03T08:01:09.050Z
---

2026-10-03, duo-test thread: a while into the session, plugin skills and agents (frontend-design, feature-dev, code-review, commit-commands, claude-md-management, skill-creator) and the Playwright MCP server appeared in a cloud thread with yskills/claude-setup attached. This corrects the earlier note in [[claude-setup-repo]] that plugins only load on the PC. They load late (after the first turns), not at spawn.
Context7 MCP failed with ERR_PROXY_TUNNEL: mcp.context7.com is not allowed by the built-in cloud environment's network policy. Fix would be a custom cloud environment that allows it.

**How to apply:** for new projects yskills adds claude-setup + the project repo; no local folder is needed for cloud threads.
