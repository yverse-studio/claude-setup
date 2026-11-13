#!/usr/bin/env node
// Check a thread brief with the start guard's own validator (briefProblems of global/team-guard.mjs, the one source) before start_thread:
// every problem at once, and the exact model id to pass. CompanyXY 2026-11-13: three restarts of one thread, a new refusal each time.
// Usage: node scripts/check-brief.mjs <Role> <file|-> [--model <id>] [--title <thread title>]
//   Exit 0 = the guard passes this brief, 1 = problems (listed), 2 = bad call. Without --model the role's own model id is checked.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHECKLISTS, briefProblems, rosterNames } from '../global/team-guard.mjs'
import { modelFor } from './brief.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args.splice(i, 2)[1] }
const model = flag('model')
const title = flag('title')
const [role, source] = args
const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
if (!role || !source || !rosterNames(teams).includes(role)) {
  console.error(`usage: node scripts/check-brief.mjs <Role> <file|-> [--model <id>] [--title <title>]; Role is one of ${rosterNames(teams).join(', ')}`)
  process.exit(2)
}
const text = readFileSync(source === '-' ? 0 : source, 'utf8')
const size = text.match(/\bSize:[ \t]*([SML])\b/i)?.[1]?.toUpperCase() ?? 'M'
const id = modelFor(role, size, teams)
const found = briefProblems(text, { model: model ?? id, title: title ?? `${role} · check`, teams, checklists: readFileSync(join(root, CHECKLISTS), 'utf8') })
const named = text.replace(/[*_`]/g, '').match(/^[ \t>-]*Role:[ \t]*([^·|\n]*?)[ \t]*(?:[·|]|$)/im)?.[1]
if (named && named !== role) found.unshift(`the brief starts Role: ${named} but you named ${role}: one of them is wrong`)
if (found.length) found.forEach((f, i) => console.log(`(${i + 1}) ${f}`))
else console.log('ok: this brief passes the start check (the board of open threads is checked at the start itself: run list_threads first)')
if (id) console.log(`model: ${id} (pass this as \`model\`)`)
process.exit(found.length ? 1 : 0)
