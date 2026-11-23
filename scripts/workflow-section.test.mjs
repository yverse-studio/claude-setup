// The workflow section check of scripts/check.mjs (#763, #764). Run: node --test scripts/workflow-section.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = join(fileURLToPath(import.meta.url), '..', '..')
const copy = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'workflow-check-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  cpSync(repo, d, { recursive: true, verbatimSymlinks: true, filter: (s) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(s) })
  return d
}
const check = (d) => { const r = spawnSync(process.execPath, [join(d, 'scripts/check.mjs')], { encoding: 'utf8' }); return { status: r.status, out: r.stdout + r.stderr } }
const edit = (d, file, fn) => writeFileSync(join(d, file), fn(readFileSync(join(d, file), 'utf8')))

test('check.mjs: the workflow section must exist above Pipeline, stay short and link every numbered line', (t) => {
  const d = copy(t)
  assert.equal(check(d).status, 0, 'the clean copy passes')
  const teams = readFileSync(join(d, 'docs/TEAMS.md'), 'utf8')
  const cases = [
    [(s) => s.replace('## The workflow', '## How it goes'), /"## The workflow" section is missing or not above "## Pipeline"/],
    [(s) => s.replace(/^5\. Someone who did not build it.*$/m, '5. Someone who did not build it gives the verdict.'), /a line without a link to its home: 5\. Someone/],
    [(s) => s.replace(/^(9\. yskills is asked.*)$/m, '$1\n\nextra one\n\nextra two\n\nextra three'), /13 non-empty lines, the cap is 12/],
  ]
  for (const [fn, want] of cases) {
    writeFileSync(join(d, 'docs/TEAMS.md'), fn(teams))
    const r = check(d)
    assert.equal(r.status, 1, String(want))
    assert.match(r.out, want)
  }
})

test('check.mjs: CLAUDE.md, the project-instructions template and WORKFLOW.md must link the workflow section', (t) => {
  const d = copy(t)
  for (const f of ['CLAUDE.md', '.claude/skills/operator/templates/project-instructions.md', 'docs/WORKFLOW.md']) edit(d, f, (s) => s.replaceAll('TEAMS.md#the-workflow', 'TEAMS.md'))
  const r = check(d)
  assert.equal(r.status, 1)
  for (const name of ['CLAUDE.md', '.claude/skills/operator/templates/project-instructions.md', 'docs/WORKFLOW.md']) assert.ok(r.out.includes(`${name}: does not link docs/TEAMS.md#the-workflow`), name)
})
