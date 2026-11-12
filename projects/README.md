# projects

The registry of projects the `new-project` workflow made: one `<name>.json` per live project, on
`main` (publish skill, §A new project). `delete-project` refuses a name that has no file here.
To start a project, the same file is pushed on branch `new/<name>`; that branch is deleted after
the run, so the new repo's first PR (a game has no scaffold thread) or a small claude-setup PR
adds the file to `main`; `delete-project` needs it there.

The same file feeds `scripts/project-instructions.mjs`, which a thread with Bash can use to print the new project's instructions text (`docs/USING.md`, Start a project).
