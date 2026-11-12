#!/usr/bin/env node
// Copies each global guard into its heredoc in cloud/setup.sh, which scripts/check.mjs keeps equal.
// Run after changing a file under global/: node scripts/sync-cloud-setup.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EMBEDDED = { GUARD: 'global/context-guard.mjs', COMPACT: 'global/compact-guard.mjs', PREPUSH: 'global/git-hooks/pre-push', ATTEMPT: 'global/attempt-guard.mjs', RULE: 'global/rule-guard.mjs', TEAM: 'global/team-guard.mjs', GATE: 'global/gate-rounds.mjs', TASK: 'global/task-ledger.mjs', CARD: 'global/card-render.mjs' }
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export function sync(sh, read = (f) => readFileSync(join(root, f), 'utf8')) {
  let out = sh
  for (const [tag, file] of Object.entries(EMBEDDED)) {
    const re = new RegExp(`(<<'${tag}'\\r?\\n)[\\s\\S]*?(\\r?\\n${tag}\\r?\\n)`)
    if (re.test(out)) out = out.replace(re, (_m, a, b) => `${a}${read(file).replace(/\r/g, '').replace(/\n+$/, '')}${b}`)
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = join(root, 'cloud/setup.sh')
  const before = readFileSync(file, 'utf8')
  const after = sync(before)
  if (after !== before) writeFileSync(file, after)
  console.log(after === before ? 'cloud/setup.sh already in step' : 'cloud/setup.sh updated')
}
