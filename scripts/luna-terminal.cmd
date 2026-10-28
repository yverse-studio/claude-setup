@echo off
rem One double-click: Windows Terminal window "luna" with the coordinator tab (API key) and the agent view
rem of all background sessions (claude agents, run from the GitHub folder so @repo dispatch works).
rem A second click adds tabs to the same window instead of opening a new one.
set "S=%~dp0"
set "GH=%USERPROFILE%\Documents\GitHub"
start "" wt -w luna new-tab --title Koordinator --tabColor #C77DFF -d "%GH%" cmd /k "%S%luna-api.cmd" ; new-tab --title Agents --tabColor #7B9EFF -d "%GH%" powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%S%claude-api.ps1" agents ; focus-tab -t 0
