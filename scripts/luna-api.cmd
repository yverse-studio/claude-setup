@echo off
rem Double-click start: Claude Code on the API key as the coordinator, in the GitHub folder.
rem Jobs from Claude Desktop wait as .md files in %USERPROFILE%\.claude\jobs (one job per file).
if not exist "%USERPROFILE%\.claude\jobs" mkdir "%USERPROFILE%\.claude\jobs"
if not defined STUDIO_ROOT (echo set STUDIO_ROOT first: see docs\laptop-folders.md & exit /b 1)
cd /d "%STUDIO_ROOT%\repos"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0claude-api.ps1" --model opus -n Koordinator "Du bist der Koordinator (Project Manager) nach claude-setup-luna2/CLAUDE.md und docs/TEAMS.md. Lies zuerst: die Jobs in %USERPROFILE%\.claude\jobs, claude-setup-luna2/docs/luna2-handoff.md, die PROGRESS.md der Repos, bei Bedarf die alten Projekt-Memories in %STUDIO_ROOT%\reference\social-media-manager\<Projekt>\memory und offene PRs (gh pr list in yverse-studio). Sag mir in hoechstens 5 Zeilen, was offen ist, mit deinem Vorschlag fuer den naechsten Schritt. Einen erledigten Job verschiebst du nach jobs\done."
