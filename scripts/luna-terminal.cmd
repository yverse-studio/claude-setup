@echo off
rem One double-click: Windows Terminal window "luna" with Luna as the coordinator in OpenCode on the Anthropic key.
rem OpenCode, not Claude Code: the promo credits cover the API and the Agent SDK but not Claude Code (billing error).
rem Claude Code with hooks stays in the Abo lane (claude) and in scripts\luna-api.cmd once real credits are bought.
set "R=%~dp0.."
node "%~dp0open-items.mjs" --html >nul
start "" wt -w luna new-tab --title Luna --tabColor #C77DFF -d "%R%" cmd /k opencode --prompt "Lies docs/luna2-handoff.md, die Jobs in %USERPROFILE%\.claude\jobs, die PROGRESS.md der Repos in %USERPROFILE%\Documents\GitHub und offene PRs (gh pr list). Sag mir in hoechstens 5 Zeilen, was offen ist, mit deinem Vorschlag fuer den naechsten Schritt."
