# The `Claude` Windows user on MeinLaptop

Claude's own home on yskills' laptop since 2026-10-08: a standard (non-admin) Windows user named
`Claude`, home `C:\Users\Claude`. Remote Control sessions for project work run here. Everything
in `install.mjs` works as on yskills' own user (`C:\Users\Ich`); this page lists only what differs.

## What is different

| Item | On this user | Why |
|---|---|---|
| Git | Portable Git in `C:\Users\Claude\Git` (PortableGit 2.55.0.5), `C:\Users\Claude\Git\cmd` on the **user** PATH | `winget install Git.Git` elevates and fails with exit code 4 on a standard user |
| Git Bash for Claude Code | user env `CLAUDE_CODE_GIT_BASH_PATH=C:\Users\Claude\Git\bin\bash.exe` | Claude Code needs Git Bash; the portable one is not where it looks by default |
| Claude Code | `C:\Users\Claude\.local\bin\claude.exe`, folder on the user PATH | native installer puts it there; PATH entry added by hand |
| claude-setup clone | `C:\Users\Claude\claude-setup` | same as `C:\Users\Ich\claude-setup` on yskills' user |
| Node, gh, Chrome | winget, machine-wide (`C:\Program Files\...`) | installed with yskills at the laptop |
| Python 3.13, ffmpeg, uv, fnm | winget `--scope user` (all in `%LOCALAPPDATA%`) | the tools `install.mjs` reports as missing |
| pwsh 7 | Microsoft Store package via `winget install --id 9MZ1SNWT0N5D --source msstore` | the MSI needs admin; `live-shot.ps1` needs pwsh |
| Blender | 5.1, machine-wide (`C:\Program Files\Blender Foundation`); Blender Lab MCP add-on 1.0.3 with Auto Start, server `Blender` in `~/.claude.json` (`studio` skill) | shared with yskills' user; add-on and server are per user |
| GitHub | `gh` logged in as `yskills-claude`; commits are authored as `Claude <339700673+yskills-claude@users.noreply.github.com>` | Claude's own account; Write on claude-setup (tested 2026-10-08), the other repos once yskills adds it |
| Claude in Chrome | extension installed in this user's Chrome profile | untested: a session only has the tools it started with, so the first fresh session there tests it with a screenshot |
| Roblox Studio | not installed | installs per user and needs a Roblox login Claude does not have yet |
| Environment variables | always set for the user, never machine-wide; no admin | standard user |

A shell started before a PATH change does not see it, and Remote Control sessions inherit the
PATH of the process that hosts them. After installs, restart that host (not just the session).

## What still needs yskills' hands

**Showing yskills something** (2026-10-18, he reads on his phone): a page opened in Claude's Chrome
on this laptop is invisible to him. A session that needs him to see or click something posts the
plain official URL as text he opens on his own device, numbered steps with the exact button names
and minutes, and a screenshot in the thread when the state matters. It never opens the page here
and calls that showing him.

- **Remote Control host restart:** the running `claude remote-control` still has the PATH from
  before the installs. In a fresh terminal on this user: `cd C:\Users\Claude\Documents\GitHub`,
  then `C:\Users\Claude\.local\bin\claude.exe remote-control`.
- **One folder approval, once per claude.ai project:** every repo is cloned under
  `C:\Users\Claude\Documents\GitHub`, so approving that one folder in the project's settings
  (Resources > Devices) covers every current and future project there; nothing is needed per
  repo. A thread cannot approve it itself (it is yskills' consent), so a new claude.ai project
  asks once, on its first Remote Control start, and never again.
- **Repo access:** `yskills-claude` gets Write on each repo at
  `https://github.com/yverse-studio/<repo>/settings/access`.
- **Mail and Cloudflare:** the Gmail connector signed in as Claude's Gmail
  (claude.ai/settings/connectors), and a Cloudflare member invite (Administrator) to that Gmail.
- **context7:** the plugin's MCP server asks for authentication once (`/mcp` in an interactive
  session).
- **Roblox Studio:** later, once Claude has a Roblox login.
- **Laptop allow list (drafted 2026-10-10, never applied):** a `permissions.allow` block (git/gh read and PR commands) plus an `autoMode.environment` entry trusting `github.com/yverse-studio` and Claude's Cloudflare account, with `"$defaults"` kept, goes into `C:\Users\Claude\.claude\settings.json` (user scope; `claude auto-mode config` shows the effective rules). Repo transfers, collaborator invites and `.git/config` edits stay blocked on purpose. The ready block is `autonomy/laptop-settings.json.md` in the reports zip.

## Long laptop jobs

yskills (2026-10-25): a POV render failed three times (GPU out of memory, a 1h+ hang, a CUDA launch failure), the laptop slept at 01:42 and the session went offline at 09:32, and nobody said so. This section is the one home of the rule.

- Run every job longer than ~10 minutes (render, bake, batch) through `node scripts/laptop-job.mjs --name <job> --timeout-min <N> -- <command>`. It refuses to start when the GPU is busy (more than 1500 MB in use, "Blender is open" named), warns when AC sleep or hibernate is not off, keeps Windows awake while the job runs, kills the whole process tree on timeout or after 15 silent minutes, and always ends with one line: `JOB OK|FAIL|HANG|TIMEOUT|BLOCKED <name>: <why>`. It runs the command without a shell and unquoted (it comes from the thread's own brief, never from outside text); a .cmd or .bat goes as `cmd /c x.bat`. [advisory]
- The thread that started the job posts that line as its reply at once, then goes on (smaller settings, a retry, the next step); a failure is never a silent wait. [advisory]
- One retry with a changed setting is fine; the same job failing a third time goes to yskills as one line plus the cause, and the rest keeps running. [advisory]
- The coordinator checks `remote_control_status` on every wake and when a laptop job is running; a device that goes offline mid-job gets one line in the project chat ("laptop offline since <time> during <job>"), with the likely cause (sleep, crash, GPU) if the log shows one. [advisory]

**Overnight and long runs:** a thread works until the goal is reached or its limit is used up, whichever comes first, and does not stop to ask on the way (ask-first items excepted). While yskills sleeps it writes one short progress line per milestone to its checklist (what finished, what runs now, what failed) so the morning read is the checklist, not a scroll. At its `Handoff:` number it still writes the handoff file and stops (`roles/project-manager.md`, Model and handoff in every brief); "run on" never means past that number. [advisory]

**Hands step, once (yskills, admin PowerShell on the laptop):** Windows must not sleep on AC. The script warns at every job start until this is done.

```
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 0
```

Check: `powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE` shows `Current AC Power Setting Index: 0x00000000`. Settings, System, Power also works: "Plugged in: sleep after" = Never. The script's keep-awake covers the job itself without admin, but not an idle gap between jobs.

## Update

```
git -C C:\Users\Claude\claude-setup pull
node C:\Users\Claude\claude-setup\install.mjs
```
