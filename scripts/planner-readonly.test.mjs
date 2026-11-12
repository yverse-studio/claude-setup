// M50 PR 3: a Planner is read-only until its plan passed the gate (the stand-in for Plan mode, research/2026-11-12-planner-vs-plan-mode.md).
// Run: node --test scripts/planner-readonly.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
let n = 0
const as = (role) => { const id = `planro${process.pid}x${++n}`; writeFileSync(join(tmpdir(), `claude-setup-role-${id}`), role); return id }
const pre = (id, cwd, tool, input) => spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd, session_id: id, transcript_path: join(cwd, 't.jsonl'), tool_name: tool, tool_input: input }), encoding: 'utf8', env: { ...process.env, CLAUDE_SETUP_RULE_GUARD: '' } })

test('a Planner writes only the plan files: source edits, commits, branches and PRs are refused until PLAN.md says PASSED', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'planro-'))
  const planner = as('Planner')
  for (const [tool, input] of [['Edit', { file_path: '/repo/src/app.mjs' }], ['Write', { file_path: '/repo/scripts/x.mjs' }], ['Bash', { command: 'git commit -am x' }], ['Bash', { command: 'git push -u origin b' }], ['mcp__github__create_pull_request', {}], ['mcp__github__push_files', {}]]) {
    const r = pre(planner, cwd, tool, input)
    assert.equal(r.status, 2, `${tool} ${JSON.stringify(input)} refused`)
    assert.match(r.stderr, /read-only until its plan passed the gate/)
  }
  for (const [tool, input] of [['Write', { file_path: `${cwd}/PLAN.md` }], ['Edit', { file_path: '/repo/features.json' }], ['Write', { file_path: '/mnt/project-files/claude-setup/workflow-fable/plan.md' }], ['Bash', { command: 'node scripts/plan.mjs add id=M1' }], ['Bash', { command: 'git status' }], ['Read', { file_path: '/repo/src/app.mjs' }]]) {
    assert.notEqual(pre(planner, cwd, tool, input).status, 2, `${tool} ${JSON.stringify(input)} stays allowed`)
  }
  assert.notEqual(pre(as('Programmer'), cwd, 'Edit', { file_path: '/repo/src/app.mjs' }).status, 2, 'only the Planner is bound')
  writeFileSync(join(cwd, 'PLAN.md'), 'Status: PASSED 5/5 (round 2)\n# Plan\n')
  assert.notEqual(pre(planner, cwd, 'Edit', { file_path: '/repo/src/app.mjs' }).status, 2, 'the gate has passed the plan')
  writeFileSync(join(cwd, 'PLAN.md'), 'Status: gate round 1\n# Plan\n')
  assert.equal(pre(planner, cwd, 'Edit', { file_path: '/repo/src/app.mjs' }).status, 2, 'a plan in a gate round is no pass')
})
