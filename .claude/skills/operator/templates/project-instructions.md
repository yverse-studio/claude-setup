Paste everything below the line into Project settings > Memory > Project instructions, once per
project (steps: `docs/USING.md`, Start a project). Replace `<app>` with one line on what the
project is. The rules live only in claude-setup; this text only makes every session load them,
so it never changes when a rule does.

---

Every session in this project, the project chat included, first adds
github.com/yverse-studio/claude-setup with add_repo if it isn't loaded, reads its CLAUDE.md and
follows it, including the operator skill for every new idea or change, for a new app and for
this live project alike. claude-setup wins over anything else here.

This project: <app>.
