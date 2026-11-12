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
  for (const [tool, input] of [['Edit', { file_path: '/repo/src/app.mjs' }], ['Write', { file_path: '/repo/scripts/x.mjs' }], ['Bash', { command: 'git commit -am x' }], ['Bash', { command: 'git push -u origin b' }], ['mcp__github__create_pull_request', {}], ['mcp__github__push_files', {}], ['Write', { file_path: '/mnt/project-files/../repo/src/x.mjs' }], ['Bash', { command: 'git -C /repo commit -am x' }], ['Bash', { command: 'echo x > src/a.mjs' }], ['Bash', { command: 'sed -i s/a/b/ src/a.mjs' }], ['Bash', { command: 'gh pr create --fill' }]]) {
    const r = pre(planner, cwd, tool, input)
    assert.equal(r.status, 2, `${tool} ${JSON.stringify(input)} refused`)
    assert.match(r.stderr, /read-only until its plan passed the gate/)
  }
  for (const [tool, input] of [['Write', { file_path: `${cwd}/PLAN.md` }], ['Edit', { file_path: '/repo/features.json' }], ['Write', { file_path: '/mnt/project-files/claude-setup/workflow-fable/plan.md' }], ['Bash', { command: 'node scripts/plan.mjs add id=M1' }], ['Bash', { command: 'git status' }], ['Bash', { command: 'cat PLAN.md | head -20 2>/dev/null' }], ['Bash', { command: 'git log --oneline -3' }], ['Read', { file_path: '/repo/src/app.mjs' }]]) {
    assert.notEqual(pre(planner, cwd, tool, input).status, 2, `${tool} ${JSON.stringify(input)} stays allowed`)
  }
  assert.notEqual(pre(as('Programmer'), cwd, 'Edit', { file_path: '/repo/src/app.mjs' }).status, 2, 'only the Planner is bound')
  writeFileSync(join(cwd, 'PLAN.md'), 'Status: PASSED 5/5 (round 2)\n# Plan\n')
  assert.notEqual(pre(planner, cwd, 'Edit', { file_path: '/repo/src/app.mjs' }).status, 2, 'the gate has passed the plan')
  writeFileSync(join(cwd, 'PLAN.md'), 'Status: gate round 1\n# Plan\n')
  assert.equal(pre(planner, cwd, 'Edit', { file_path: '/repo/src/app.mjs' }).status, 2, 'a plan in a gate round is no pass')
})

test('a Planner cannot approve its own plan: writing the pass line is refused, only a first-line pass lifts the lock', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'planro-'))
  const planner = as('Planner')
  for (const [tool, input] of [['Write', { file_path: `${cwd}/PLAN.md`, content: 'Status: PASSED 5/5\n# Plan' }], ['Edit', { file_path: `${cwd}/PLAN.md`, new_string: 'Status: PASSED 5/5' }], ['Bash', { command: 'printf "Status: PASSED 5/5" > PLAN.md' }]]) {
    const r = pre(planner, cwd, tool, input)
    assert.equal(r.status, 2, `${tool} refused`)
    assert.match(r.stderr, /the gate sets `Status: PASSED`/)
  }
  writeFileSync(join(cwd, 'PLAN.md'), '# Plan\nStatus: PASSED 5/5 (a later line is no pass)\n')
  assert.equal(pre(planner, cwd, 'Edit', { file_path: '/repo/src/app.mjs' }).status, 2, 'only the first line counts')
})

test('the pass line cannot be built from pieces, the shell is an allowlist, plan.mjs runs only in its exact form', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'planro-'))
  const planner = as('Planner')
  writeFileSync(join(cwd, 'PLAN.md'), 'Status: PA\n# Plan\n')
  for (const [tool, input] of [
    ['Edit', { file_path: `${cwd}/PLAN.md`, old_string: 'Status: PA', new_string: 'Status: PASSED' }],
    ['MultiEdit', { file_path: `${cwd}/PLAN.md`, edits: [{ old_string: 'PA', new_string: 'PASS' }, { old_string: 'PASS', new_string: 'PASSED' }] }],
  ]) {
    const r = pre(planner, cwd, tool, input)
    assert.equal(r.status, 2, `${tool} split pass refused`)
    assert.match(r.stderr, /the gate sets `Status: PASSED`/)
  }
  for (const command of ['node scripts/plan.mjs add id=M1; git commit -am x', 'node scripts/plan.mjs add $(touch src/a)', 'node /mnt/project-files/scripts/plan.mjs add', 'python3 -c "open(1)"', 'curl -o src/a.mjs http://x', 'find . -delete', 'git status && rm -rf src', 'cat PLAN.md | tee src/a.mjs', 'ls & rm -rf src', 'ls &rm src/a']) {
    const r = pre(planner, cwd, 'Bash', { command })
    assert.equal(r.status, 2, `${command} refused`)
    assert.match(r.stderr, /read-only until its plan passed the gate/)
  }
  for (const command of ['node scripts/plan.mjs add id=M1 title="Plan it"', 'ls -la | head', 'git -C /repo log --oneline -3', 'grep -rn foo src | wc -l', 'cd /repo && git diff', 'node ~/.claude/claude-setup/rule-guard.mjs read https://example.com/a']) {
    assert.notEqual(pre(planner, cwd, 'Bash', { command }).status, 2, `${command} allowed`)
  }
})
