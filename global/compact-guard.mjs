#!/usr/bin/env node
// PreCompact hook: what a hook prints to stdout becomes instructions for the compaction summary.
// Tell it what to keep verbatim (the thread's Role/Kit/Size line, branch, PR, asks, decisions with
// reasons, the last error, files changed, Done-when) and what to drop. Never fails a compaction.
const INSTRUCTIONS = `Compaction summary: keep these verbatim, drop the rest.
Keep verbatim: the thread's "Role: ... · Kit: ... · Size: ..." line; the branch and the PR; the open asks of yskills and their status; every decision with its reason; the last error text verbatim; the files changed; the "Done when:" line.
Drop: logs, intermediate states, tool output.`

process.stdin.resume()
process.stdin.on('end', () => process.stdout.write(`${INSTRUCTIONS}\n`))
