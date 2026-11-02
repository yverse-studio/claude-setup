@echo off
rem Luna Uebersicht: rebuilds the "Was ist offen" page and opens it in the default browser.
set "OUT=%USERPROFILE%\.claude\open-items.html"
node "%~dp0open-items.mjs" --html "%OUT%" >nul
start "" "%OUT%"
