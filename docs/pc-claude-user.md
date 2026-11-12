# The `Claude` Windows user on MeinLaptop

Claude's own home on yskills' laptop since 2026-10-08: a standard (non-admin) Windows user named
`Claude`, home `%USERPROFILE%`. Remote Control sessions for project work run here. Everything
in `install.mjs` works as on yskills' own user (`%USERPROFILE%` of that user); this page lists only what differs.

## Folders on this user (2026-10-29)

- `repos/<repo>` (under `STUDIO_ROOT`): one git clone per repo.
  Extra branches of a repo live as worktrees in `_claude/_worktrees/<repo>/<name>` (rules: `docs/laptop-folders.md`).
- `lib/` (assets by type) and `projects/games/companyxy/`: all art sources; downloads land in `inbox/`. The game play copy stays
  in `projects/games/companyxy/build/` (not a repo).
- `Private18` (in the Documents folder, outside `STUDIO_ROOT`): 18+ content and its backups; the git rule is in `docs/game-pipeline.md`.
- `%USERPROFILE%\tools`: SDKs installed by hand (Ren'Py). Scratch work: `%TEMP%\opencode`, deleted when done.

## What is different

| Item | On this user | Why |
|---|---|---|
| Git | Portable Git in `%USERPROFILE%\Git` (PortableGit 2.55.0.5), `%USERPROFILE%\Git\cmd` on the **user** PATH | `winget install Git.Git` elevates and fails with exit code 4 on a standard user |
| Git Bash for Claude Code | user env `CLAUDE_CODE_GIT_BASH_PATH=%USERPROFILE%\Git\bin\bash.exe` | Claude Code needs Git Bash; the portable one is not where it looks by default |
| Claude Code | `%USERPROFILE%\.local\bin\claude.exe`, folder on the user PATH | native installer puts it there; PATH entry added by hand |
| claude-setup clone | `%USERPROFILE%\claude-setup` | same place on yskills' user |
| Node, gh, Chrome | winget, machine-wide (`%ProgramFiles%`) | installed with yskills at the laptop |
| Python 3.13, ffmpeg, uv, fnm | winget `--scope user` (all in `%LOCALAPPDATA%`) | the tools `install.mjs` reports as missing |
| pwsh 7 | Microsoft Store package via `winget install --id 9MZ1SNWT0N5D --source msstore` | the MSI needs admin; `live-shot.ps1` needs pwsh |
| Blender | 5.1, machine-wide (`%ProgramFiles%\Blender Foundation`); Blender Lab MCP add-on 1.0.3 with Auto Start, server `Blender` in `~/.claude.json` (`studio` skill) | shared with yskills' user; add-on and server are per user |
| GitHub | `gh` logged in as `yskills-claude`; commits are authored as `Claude <339700673+yskills-claude@users.noreply.github.com>` | Claude's own account; Write on claude-setup (tested 2026-10-08), the other repos once yskills adds it |
| Claude in Chrome | extension installed in this user's Chrome profile | works (2026-10-26): `list_connected_browsers` shows it while yskills' Chrome is open |
| Roblox Studio | not installed | installs per user and needs a Roblox login Claude does not have yet |
| Environment variables | set per user | standard user |

A shell started before a PATH change does not see it, and Remote Control sessions inherit the
PATH of the process that hosts them. After installs, restart that host (not just the session).

## Fresh main first

yskills (2026-10-26): a laptop thread read claude-setup from an old branch and missed the current rules. The first step of every laptop or Remote Control thread, before it reads anything: `git -C <claude-setup clone> fetch origin && git -C <clone> checkout main && git -C <clone> pull --ff-only` (clone: `%USERPROFILE%\claude-setup`, or the one in `repos/`); run `node install.mjs` too when the pull changed `global/` or `config/`. Only then read `CLAUDE.md`, `docs/MAP.md` and the brief's guides. A dirty tree or a failed pull is reported in one line, not read around.

## Logins: use yskills' open Chrome

yskills (2026-10-26): anything that needs a login (TikTok, Google, a dashboard) runs in his
already-open, logged-in Chrome on this user through Claude in Chrome (`list_connected_browsers`,
then a tab of your own), so he logs in once. Chrome 136+ blocks remote debugging on its main
profile, so Playwright there just hangs. Chrome closed: ask him to open it, then go on. Headless
Playwright serves public pages.

## What still needs yskills' hands

**Showing yskills something** (2026-10-18, he reads on his phone): a page opened in Claude's Chrome
on this laptop is invisible to him. A session that needs him to see or click something posts the
plain official URL as text he opens on his own device, numbered steps with the exact button names
and minutes, and a screenshot in the thread when the state matters. It never opens the page here
and calls that showing him.

**Link formats for every ask** (rule: `CLAUDE.md`, How to work): a thread as `[title](#cmsg_…)`, a PR or page as its full URL, a setting as `[Project settings](#project-settings/<section>)` (`resources` for repos and folders), GitHub access as `https://claude.ai/connect-github`. The coordinator card carries the rule for the project chat, which lacks hooks.

- **Remote Control host restart:** the running `claude remote-control` still has the PATH from
  before the installs. In a fresh terminal on this user: `cd %STUDIO_ROOT%\repos`,
  then `%USERPROFILE%\.local\bin\claude.exe remote-control`.
- **One folder approval, once per claude.ai project (steps: `docs/USING.md`, Start a project step 5):** every repo is cloned under
  `repos/` under `STUDIO_ROOT`, so approving that one folder in the project's settings
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
- **Laptop allow list and autoMode (2026-10-26):** `install.mjs` writes them from `global/settings.json` (`docs/permissions.md`); `claude auto-mode config` shows the effective rules.
- **Laptop permission mode: Accept edits (yskills 2026-10-26).** In Auto mode the classifier blocked replacing a live `.blend` three times although the old file was zipped and MD5-checked and yskills had said yes; an allow rule like `Bash(mv:*)` does not get past it. So on the laptop `%USERPROFILE%\.claude\settings.json` has `"defaultMode": "acceptEdits"`: the allow and project rules decide, `ask` and `deny` still stop the risky things (force push, deploy, secrets, `rm -rf`). Cloud threads keep `auto` (nobody there to answer a prompt). Claude never edits its own permission settings; yskills changes the mode (the file, or the mode button under the message box in the Code tab; Remote Control on the phone has no such button). A running session keeps the mode it started with. `install.mjs` keeps a `defaultMode` already set on the machine. Deleting: allowed without asking once checked (copy verified, file not open, nothing links to it); ask only for important things.

## No windows

Nothing opens on yskills' screen while Claude works, on any machine, unless he asked for it (yskills
2026-11-11: "ich will nicht das mir irgendwas in gesicht springt jemals wenn du arbeitest außer ich sage
es"): no exe, browser, Explorer window, Blender UI or popup. Screenshots come from a headless browser
(Playwright), renders from `blender -b`, helpers from `Start-Process -WindowStyle Hidden`. When he asked to
see something, the command ends with `# yskills asked`. [guard: hook global/rule-guard.mjs]

## Long laptop jobs

Only jobs that need the laptop get here: Blender runs in the cloud first (`studio` skill, Where Blender runs).

yskills (2026-10-25): a POV render failed three times (GPU out of memory, a 1h+ hang, a CUDA launch failure), the laptop slept at 01:42 and the session went offline at 09:32, and nobody said so. This section is the one home of the rule.

- Run every job longer than ~10 minutes (render, bake, batch) through `node scripts/laptop-job.mjs --name <job> --timeout-min <N> -- <command>`. It refuses to start when the GPU is busy (more than 1500 MB in use, "Blender is open" named), warns when AC sleep or hibernate is not off, keeps Windows awake while the job runs, kills the whole process tree on timeout or after 15 silent minutes, and always ends with one line: `JOB OK|FAIL|HANG|TIMEOUT|BLOCKED <name>: <why>`. It runs the command without a shell and unquoted (it comes from the thread's own brief, never from outside text); a .cmd or .bat goes as `cmd /c x.bat`. [advisory]
- **Blender limits** (yskills 2026-10-26, after the VIDEO_TDR_FAILURE GPU crashes of 2026-10-25 when renders overlapped): on the laptop one global Blender lock: at most 1 job runs and at most 2 Blender instances exist (ours plus his own; companyxy 2026-11-12: parallel jobs on about 3.6 GB free RAM). `scripts/laptop-job.mjs` enforces it with a counting lock (`scripts/laptop-slots.mjs`): a job takes the one render slot, a Blender job also waits while 2 `blender.exe` run, and an extra job prints `QUEUED <name>` and waits (`--queue-min`, default 180, then `JOB BLOCKED`) instead of failing. yskills' own manual Blender is counted but never blocked or killed. Every Blender render or bake goes through the script, never started by hand next to it. The GPU-busy check is skipped while another job holds a slot (its memory is ours). [guard: scripts/laptop-job.mjs]
- **Heartbeat and resume** (companyxy 2026-11-12: an animator waited hours on render jobs that had crashed at 4/96 and 0 frames, never checking): a Blender job passes `--progress-file <file>` (or `--no-progress "<why>"` for a one-frame still). The job rewrites that file after every frame or step; `scripts/laptop-job.mjs` kills it as `JOB HANG` when the file is older than `--heartbeat-min` (default 10) or never appeared, and refuses to start a Blender job with neither flag. Render-queue jobs carry `"progress"` or `"noProgress"`. The writer is `scripts/blender/progress_heartbeat.py` (add `-P` before the render, `-- <progress file>`): a render handler rewrites the file after every frame. The first frame has 30 min of grace. A render resumes by skipping frames already on disk (Overwrite off); the frame files are the checkpoint. [guard: scripts/laptop-job.mjs, test scripts/laptop-job.test.mjs]
- **RAM ledger** (2026-10-28, a crash at 23:20 was our two plus the animator's headless ones; 2026-11-12: nobody could say who held the RAM): whoever starts Blender or Ren'Py signs in and signs out again. `scripts/laptop-job.mjs` does it for every Blender and Ren'Py job (ledger files next to the render slots, `scripts/laptop-slots.mjs`; a dead pid drops out by itself, so a crash signs out too), waits while less than ~2.5 GB is free and prints the ledger with the "RAM low" line. A start outside the script (never for Blender renders) signs in by hand with `ledgerSignIn` and out when it ends. The old admin RAM script is removed and stays out; the RAM leak steps are in Claude desktop app RAM leak below. [guard: scripts/laptop-job.mjs, test scripts/laptop-job.test.mjs, banned phrase in scripts/check.mjs]
- **Device tools need an owner message in the thread** (2026-11-12: a thread tried `device_*` tools with no message from yskills and was refused, and he was asked to type for folders that were already approved): the tools work once the thread holds a message from the owner, so a thread that starts without one (a relay only) answers its first owner message with the device work, and never asks yskills to type a line, tap or re-approve a folder that `list_devices` shows as approved; it calls `list_devices`, uses the listed path as is, and asks for a folder only when none fits. [advisory]
- **RAM is per job, ours first, one ask** (2026-11-12: yskills was asked four times in three hours to close a browser that was already closed; the test then ran with 3 GB): a job states the RAM it measured it needs, not a blanket 4 GB, and light jobs run with what is free. Short on RAM: first close our own processes (the NOW block of `WHO.md`, a browser a Claude thread started), then run reduced or queue for the night. yskills is asked once at most, with numbers (before telling him to close an app, run and quote the top 10 processes by memory and the free RAM: `Get-Process | Sort-Object WS -Descending | Select-Object -First 10 Name,@{n='MB';e={$_.WS/1MB -as [int]}}` and `Get-CimInstance Win32_OperatingSystem | Select FreePhysicalMemory`; no numbers, no claim; false alarm 2026-11-08) and the process named. A permission check that refuses to end a foreign program is not retried and nothing is announced before it happened. [advisory]
- **All hands steps up front** (2026-11-12: a folder move asked for a password, then a browser, then a Notepad window, then an admin script, one at a time over 16 hours): a job that needs yskills' hands runs a dry run first (locked files, admin rights, RAM, credentials) and posts every step in one numbered list, each with its exact command or path, before it starts. [advisory]
- The thread that started the job posts that line as its reply at once, then goes on (smaller settings, a retry, the next step); a failure is never a silent wait. [advisory]
- One retry with a changed setting is fine; the same job failing a third time goes to yskills as one line plus the cause, and the rest keeps running. [advisory]
- The coordinator checks `remote_control_status` on every wake and when a laptop job is running; a device that goes offline mid-job gets one line in the project chat ("laptop offline since <time> during <job>"), with the likely cause (sleep, crash, GPU) if the log shows one. [advisory]

**Overnight and long runs:** while yskills sleeps a thread writes one short progress line per milestone to its checklist (what finished, what runs now, what failed), so the morning read is the checklist. Handoff triggers: `docs/WORKFLOW.md`.

**Hands step, once (yskills, admin PowerShell on the laptop):** Windows must not sleep on AC. The script warns at every job start until this is done.

```
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 0
```

Check: `powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE` shows `Current AC Power Setting Index: 0x00000000`. Settings, System, Power also works: "Plugged in: sleep after" = Never. The script's keep-awake covers the job itself without admin, but not an idle gap between jobs.

## Dropped sessions and permissions (2026-11-03)

yskills (2026-11-03): Remote Control sessions on the laptop dropped mid-turn, "this happens too often". Evidence from the Windows event log, `%LOCALAPPDATA%\Claude\logs\main.log` and `remote-control.log`: the laptop had 0.6 of 15.7 GB RAM free, so the Claude app's CliGovernor evicted "idle" sessions (`governor_evict`); a session waiting 23 min on a Blender batch counts as idle and its turn dies. It was not the network, not sleep (none since the reboot) and not Surfshark. The same night the Acer Quick Access service reset the power plan after every charger blip, which put Wi-Fi power saving back to Maximum.

- **Watchdog:** `scripts/laptop/rc-watchdog.ps1`, installed by `scripts/laptop/install-rc-watchdog.ps1` (user task `RC-Watchdog`, every 2 min, no admin, costs no tokens). It puts Wi-Fi power saving back to Maximum Performance, restarts the Claude app if it is gone, restarts the WLAN adapter after 3 failed network checks (needs admin, else logs it) and logs low RAM and governor evictions to `%LOCALAPPDATA%\rc-watchdog\watchdog.log`. It never kills a process. It treats the symptom: fewer parallel sessions (the app's cap is 6) is the real lever. [advisory]
- **Overnight chains** run as one headless PowerShell script with resume markers, so a dropped session does not stop the work and Claude only reads the results (example: the game's `night_runner.ps1`). Waits for older jobs, never kills Blender, runs one Blender at a time.
- **Permissions:** `scripts/laptop/claude-settings.template.json` plus `scripts/laptop/install-claude-settings.ps1` (merges into `~/.claude/settings.json`, keeps existing entries, writes a `.bak`): `defaultMode` acceptEdits, a clean allow list (whole tools plus the home folder, no duplicate sub-rules), an `ask` list (deletes, secrets, repo edits) and a deny list (secrets, disk formatting, `rm -rf` on roots, force-push to main, deploy commands). The installer writes UTF-8 without BOM. Note: auto mode has its own classifier that blocks persistence (scheduled tasks, background processes) whatever `permissions.allow` says; acceptEdits plus this list does not. [advisory]

## Claude desktop app RAM leak (2026-11-12, again)

Symptom (yskills, more than once): about 10 GB "driver" (kernel pool) memory, 0.57 of 15.7 GB free, a 3D job start blocked by the RAM check in `scripts/laptop-job.mjs`. Process memory in Task Manager looks small, so the suspect is the long-running Claude app and its sessions, not the job.

- **Warning:** `rc-watchdog.ps1` (above) shows one Windows toast per low episode when free RAM drops under 4 GB (none while a laptop job holds a slot; re-armed at 4 GB again) and logs the top 5 processes plus the nonpaged/paged pool (CIM `Win32_PerfFormattedData_PerfOS_Memory`, works on de-DE; `check-laptop.ps1` reads the same number) to `%LOCALAPPDATA%\rc-watchdog\watchdog.log`. Free, costs no tokens, kills nothing. The pool lines are the proof of the leak: read them before blaming an app.
- **Restart rule:** toast, or under 4 GB free with no job running: quit the Claude app completely (tray icon, Quit) and start it again as a test; sessions resume. A kernel pool leak may not shrink from that: then restart Windows. A running job is left alone: wait for the job, then restart. Restart the app once a week anyway; a Windows restart also clears the pool. yskills is asked once at most, with the numbers (see `RAM is per job`).
- **Install once, no admin** (the task runs the repo file, so a `git pull` is enough for later changes): `powershell -NoProfile -ExecutionPolicy Bypass -File %USERPROFILE%\claude-setup\scripts\laptop\install-rc-watchdog.ps1` [advisory]

## Update

```
git -C %USERPROFILE%\claude-setup pull
node %USERPROFILE%\claude-setup\install.mjs
```
