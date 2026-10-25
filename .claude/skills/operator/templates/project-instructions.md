Paste everything below the line into Project settings > Memory > Project instructions, once per
project (steps: `docs/USING.md`, Start a project). Generate it with
`node scripts/project-instructions.mjs <name> --about "<one line>"`; this file is that script's
source, and `{{name}}`, `{{about}}`, `{{repo}}` and `{{kind}}` are filled from `projects/<name>.json`
or the flags. The rules live only in claude-setup; this text only makes every session load them,
so it never changes when a rule does.

---

Every session in this project, the project chat included, first adds
github.com/yverse-studio/claude-setup with add_repo if it isn't loaded, reads its CLAUDE.md and
docs/MAP.md (Start here) and follows them. claude-setup wins over anything written here.

This project ({{name}}): {{about}} (kind: {{kind}}; repo {{repo}}).
Its repo's CLAUDE.md and docs/LESSONS.md (when it exists) come next; lessons about this product go to {{repo}}/docs/LESSONS.md.
Lessons that hold for every project go to claude-setup.
Project memory holds state only, in the shape of claude-setup's operator/templates/project-memory.md.

The first session after this text is pasted runs the memory check from claude-setup
docs/WORKFLOW.md (Learning) once: it moves every lasting line of this project's memory into its
home, archives the raw files, rewrites MEMORY.md from the template, and reports it in three lines.
