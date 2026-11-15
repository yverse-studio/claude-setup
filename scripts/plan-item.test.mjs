// #605: a `Done:` post of a thread whose brief names `Item: M<n>` is refused once while that item of PLAN.json is open. Run: node --test scripts/plan-item.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
let n = 0
const brief = (item) => `<wake reason="spawn"><relay>\nRole: Programmer · Kit: setup · Size: S\nItem: ${item}\nModel: sonnet\n</relay></wake>`
const PLAN = (status) => JSON.stringify({ goal: 'g', updated: '2026-11-15T10:00Z', items: [{ id: 'M3', title: 'Shop', status, ...(status === 'done' ? { evidence: 'https://x/pull/1' } : {}) }], decisions: [] })

function thread(t, item, plan) {
  const dir = mkdtempSync(join(tmpdir(), 'plan-item-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const session = `planitem${process.pid}x${n++}`
  const transcript = join(dir, 't.jsonl')
  writeFileSync(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: brief(item) } })}\n`)
  writeFileSync(join(tmpdir(), `claude-setup-start-${session}`), '') // the start check is not under test
  const planFile = join(dir, 'PLAN.json')
  if (plan) writeFileSync(planFile, plan)
  const send = (text, tool_name = 'mcp__hearthbot__post_message') => spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], {
    input: JSON.stringify({ cwd: root, session_id: session, transcript_path: transcript, tool_name, tool_input: { text } }),
    encoding: 'utf8', env: { ...process.env, CLAUDE_SETUP_RULE_GUARD: '', PLAN_FILE: planFile },
  })
  // The first reply of a thread opens with its start receipt (not under test): ask for it once with a plain reply and put it ahead of every text.
  const receipt = send('x ٩(◕‿◕)۶').stderr.match(/TEAMS\.md\): (Thread · [^\n]*)/)?.[1] ?? ''
  return { post: (text, tool) => send(`${receipt}\n${text}`, tool) }
}
const DONE = 'Done: https://github.com/o/r/pull/1 ٩(◕‿◕)۶'

test('a Done: post is refused once while the thread\'s plan item is open, with the exact command', (t) => {
  const { post } = thread(t, 'M3', PLAN('doing'))
  const first = post(DONE)
  assert.equal(first.status, 2, first.stderr)
  assert.match(first.stderr, /M3 is still "doing"[^\n]*plan\.mjs set M3 status=done evidence=<link>/)
  assert.equal(post(DONE).status, 0, 'refused once, then through')
})

test('a post that is no Done: line, a done or dropped item, a missing item or file and a #n item check nothing', (t) => {
  assert.equal(thread(t, 'M3', PLAN('doing')).post('Working on it ٩(◕‿◕)۶').status, 0)
  assert.equal(thread(t, 'M3', PLAN('done')).post(DONE).status, 0)
  assert.equal(thread(t, 'M3', JSON.stringify({ goal: 'g', items: [{ id: 'M3', title: 'x', status: 'drop', why: 'w' }] })).post(DONE).status, 0)
  assert.equal(thread(t, 'M9', PLAN('doing')).post(DONE).status, 0, 'no such item')
  assert.equal(thread(t, 'M3', null).post(DONE).status, 0, 'no plan file')
  assert.equal(thread(t, 'M3', '{not json').post(DONE).status, 0, 'a broken file')
  assert.equal(thread(t, '#7', PLAN('doing')).post(DONE).status, 0, 'an issue item')
  assert.equal(thread(t, 'M3', PLAN('doing')).post(DONE, 'mcp__hearthbot__message_coordinator').status, 0, 'only a post_message to yskills counts')
})
