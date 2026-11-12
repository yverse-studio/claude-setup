# Hands off: what a role leaves to its owner

One home for the role boundary (yskills 2026-11-12: a devlog thread made itself Social Lead and wrote the script itself, skipping the
Writer and the Hook Checker, and nothing refused). `global/rule-guard.mjs` (`handsOff`) refuses a Write or Edit by a thread of the first
column to a file whose name contains a word of the second column; the owner of that work is the third column, called as its own subagent
(`docs/TEAMS.md`, Roster). Add a row when a role is caught doing another role's work.

| Role | Does not write a file named with | Owner |
|---|---|---|
| Social Lead | script | Writer |
| Social Lead | hook | Hook Checker |
