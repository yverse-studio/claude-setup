#!/usr/bin/env node
// M28: the structure check of a task's PLAN.md (docs/templates/task-plan.md). Lists every gap at once; exit 1 on any. The rules live in
// global/task-ledger.mjs (the installed guard file registerPlan uses); this is the thread's CLI.
// Usage: node scripts/task-plan-check.mjs <PLAN.md> [--topic <topic>]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkPlan } from '../global/task-ledger.mjs'

export { checkPlan }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const t = args.indexOf('--topic')
  const topic = t >= 0 ? args[t + 1] : null
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--topic')
  if (!file) { console.error('usage: task-plan-check.mjs <PLAN.md> [--topic <topic>]'); process.exit(2) }
  const gaps = checkPlan(readFileSync(file, 'utf8'), { topic })
  if (gaps.length) { console.error(`${file}\n${gaps.map((g) => `x ${g}`).join('\n')}`); process.exit(1) }
}
