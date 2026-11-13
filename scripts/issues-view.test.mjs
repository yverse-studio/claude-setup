// S2 (#543): the coordinator has no hooks and no GitHub tool, so the hook of every thread's post_message renders the open `plan` issues
// into ISSUES.md beside the coordinator card. Run: node --test scripts/issues-view.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { refreshIssues, renderIssues } from '../global/card-render.mjs'
import { buildCard } from './coordinator-card.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const NOW = new Date('2026-11-13T09:00:00Z')
const ISSUES = [
  { number: 12, title: 'Build the thing', state: 'open', labels: ['plan', 'size:S'], updated: '2026-11-13T08:30:00Z' },
  { number: 9, title: 'Done this morning', state: 'closed', labels: ['plan'], updated: '2026-11-13T07:00:00Z', closed: '2026-11-13T07:00:00Z' },
  { number: 3, title: 'Done last week', state: 'closed', labels: ['plan'], updated: '2026-11-06T07:00:00Z', closed: '2026-11-06T07:00:00Z' },
]

test('renderIssues: repo and UTC time in the header, "do not edit", open issues with number, title, labels and update, closed only from the last 24 h', () => {
  const md = renderIssues({ repo: 'yverse-studio/claude-setup', issues: ISSUES, now: NOW })
  assert.match(md.split('\n').slice(0, 3).join('\n'), /yverse-studio\/claude-setup[\s\S]*2026-11-13 09:00 UTC[\s\S]*do not edit/i)
  assert.match(md, /#12 .*Build the thing.*plan, size:S.*2026-11-13 08:30/)
  assert.match(md, /#9 .*Done this morning/)
  assert.doesNotMatch(md, /Done last week/)
})

const folder = () => mkdtempSync(join(tmpdir(), 'issues-'))
test('refreshIssues: writes once, skips a file younger than 60 s, rewrites an older one, keeps the old file on a dead fetch, writes nothing without plan issues', () => {
  const out = folder()
  let calls = 0
  const ok = () => { calls++; return { repo: 'o/r', issues: ISSUES } }
  assert.ok(refreshIssues(ok, out, NOW))
  assert.match(readFileSync(join(out, 'ISSUES.md'), 'utf8'), /Build the thing/)
  const fresh = new Date(NOW.getTime() - 30_000)
  utimesSync(join(out, 'ISSUES.md'), fresh, fresh)
  assert.equal(refreshIssues(ok, out, NOW), null)
  assert.equal(calls, 1, 'a 30 s old file is not fetched again')
  const old = new Date(NOW.getTime() - 120_000)
  utimesSync(join(out, 'ISSUES.md'), old, old)
  assert.equal(refreshIssues(() => null, out, NOW), null)
  assert.match(readFileSync(join(out, 'ISSUES.md'), 'utf8'), /Build the thing/, 'a dead fetch leaves the old file')
  const empty = folder()
  assert.equal(refreshIssues(() => ({ repo: 'o/r', issues: [] }), empty, NOW), null)
  assert.equal(existsSync(join(empty, 'ISSUES.md')), false)
  assert.equal(refreshIssues(() => { throw new Error('boom') }, folder(), NOW), null, 'a throwing fetch never propagates')
})

test('the coordinator card points at ISSUES.md and at Item: new', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  assert.match(card, /ISSUES\.md/)
  assert.match(card, /Item: new/)
})

// The hook end to end: a stub `gh` answers the issue list; the thread's post_message refreshes the file, a dead `gh` leaves the reply passing.
test('hook: a thread post_message renders ISSUES.md from the stubbed list; a dead gh still lets the reply pass', () => {
  const bin = mkdtempSync(join(tmpdir(), 'fakegh-'))
  const out = folder()
  const repo = mkdtempSync(join(tmpdir(), 'issues-repo-'))
  spawnSync('git', ['-C', repo, 'init', '-q'])
  spawnSync('git', ['-C', repo, 'remote', 'add', 'origin', 'https://github.com/o/r.git'])
  const gh = (body, code = 0) => { writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncat <<'EOF2'\n${body}\nEOF2\nexit ${code}\n`); chmodSync(join(bin, 'gh'), 0o755) }
  const run = () => spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd: repo, tool_name: 'mcp__hearthbot__post_message', tool_input: { text: 'Fertig (◕‿◕)' } }), encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_SETUP_PROJECT_FILES: out } })
  gh(JSON.stringify([{ number: 7, title: 'From the stub', state: 'open', labels: [{ name: 'plan' }], updated_at: new Date().toISOString(), closed_at: null }, { number: 8, title: 'A pull request', state: 'open', labels: [{ name: 'plan' }], pull_request: {}, updated_at: new Date().toISOString() }]))
  const r = run()
  assert.equal(r.status, 0, r.stderr)
  const file = join(out, 'claude-setup', 'ISSUES.md')
  assert.match(readFileSync(file, 'utf8'), /#7 .*From the stub/)
  assert.doesNotMatch(readFileSync(file, 'utf8'), /A pull request/, 'a pull request is no plan item')
  assert.match(readFileSync(file, 'utf8'), /o\/r/)
  const old = new Date(Date.now() - 120_000)
  utimesSync(file, old, old)
  gh('not json', 1)
  assert.equal(run().status, 0, 'a dead gh never blocks the reply')
  assert.match(readFileSync(file, 'utf8'), /From the stub/)
})
