// #605: a `Done:` post of a thread whose brief names `Item: M<n>` is refused once while that item of PLAN.json is open. Run: node --test scripts/plan-item.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
let n = 0
const brief = (item) => `<wake reason="spawn"><relay>\nRole: Programmer · Kit: setup · Size: S\nItem: ${item}\nModel: sonnet\n</relay></wake>`
const PLAN = (status) => JSON.stringify({ goal: 'g', updated: '2026-11-15T10:00Z', items: [{ id: 'M3', title: 'Shop', status, ...(status === 'done' ? { evidence: 'https://x/pull/1' } : {}) }], decisions: [] })

function thread(t, item, plan, where = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'plan-item-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const session = `planitem${process.pid}x${n++}`
  const transcript = join(dir, 't.jsonl')
  writeFileSync(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: brief(item) } })}\n`)
  writeFileSync(join(tmpdir(), `claude-setup-start-${session}`), '') // the start check is not under test
  const planFile = join(dir, 'PLAN.json')
  if (plan) writeFileSync(planFile, plan)
  const send = (text, tool_name = 'mcp__hearthbot__post_message') => spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], {
    input: JSON.stringify({ cwd: where.cwd ?? root, session_id: session, transcript_path: transcript, tool_name, tool_input: { text } }),
    encoding: 'utf8', env: { ...process.env, CLAUDE_SETUP_RULE_GUARD: '', PLAN_FILE: planFile, ...(where.home ? { HOME: where.home, USERPROFILE: where.home } : {}) },
  })
  // The first reply of a thread opens with its start receipt (not under test): ask for it once with a plain reply and put it ahead of every text.
  const receipt = send('x ٩(◕‿◕)۶').stderr.match(/TEAMS\.md\): (Thread · [^\n]*)/)?.[1] ?? ''
  return { post: (text, tool) => send(`${receipt}\n${text}`, tool), planFile, dir }
}
const DONE = 'Done: https://github.com/o/r/pull/1 ٩(◕‿◕)۶'

test('a Done: post is refused once while the thread\'s plan item is open, with the exact command', (t) => {
  const { post } = thread(t, 'M3', PLAN('doing'))
  const first = post(DONE)
  assert.equal(first.status, 2, first.stderr)
  assert.match(first.stderr, /M3 is still "doing"[^\n]*If this Done: finishes it, run: node \/\S*scripts\/plan\.mjs set M3 status=done evidence=<link>, then post again\. If the item goes on after this thread[^\n]*post again as it is/)
  assert.equal(post(DONE).status, 0, 'refused once, then through')
})

test('the named command runs from any folder and closes the item', (t) => {
  const { post, planFile, dir } = thread(t, 'M3', PLAN('doing'))
  const script = post(DONE).stderr.match(/run: node (\S+scripts\/plan\.mjs) set M3/)?.[1]
  assert.ok(script && script.startsWith('/'), 'an absolute path to the checkout\'s plan.mjs')
  const elsewhere = mkdtempSync(join(tmpdir(), 'plan-cwd-'))
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }))
  const r = spawnSync(process.execPath, [script, 'set', 'M3', 'status=done', 'evidence=https://github.com/o/r/pull/1'], { cwd: elsewhere, encoding: 'utf8', env: { ...process.env, PLAN_FILE: planFile } })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(JSON.parse(readFileSync(planFile, 'utf8')).items[0].status, 'done')
  assert.ok(dir)
})

test('without a checkout the refusal says so instead of naming a path that does not exist', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'plan-home-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const r = thread(t, 'M3', PLAN('doing'), { cwd: home, home }).post(DONE)
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /M3 is still "doing"[^\n]*no claude-setup checkout here: ask the coordinator/)
  assert.doesNotMatch(r.stderr, /node \/\S*plan\.mjs/)
})

test('a post that is no Done: line, a done or dropped item, a missing item or file and a #n item check nothing', (t) => {
  assert.equal(thread(t, 'M3', PLAN('doing')).post('Working on it ٩(◕‿◕)۶').status, 0)
  assert.equal(thread(t, 'M3', PLAN('done')).post(DONE).status, 0)
  assert.equal(thread(t, 'M3', JSON.stringify({ goal: 'g', items: [{ id: 'M3', title: 'x', status: 'drop', why: 'w' }] })).post(DONE).status, 0)
  assert.equal(thread(t, 'M9', PLAN('doing')).post(DONE).status, 0, 'no such item')
  assert.equal(thread(t, 'M3', null).post(DONE).status, 0, 'no plan file')
  assert.equal(thread(t, 'M3', '{not json').post(DONE).status, 0, 'a broken file')
  assert.equal(thread(t, '#7', PLAN('doing')).post(DONE).status, 0, 'an issue item')
  for (const other of ['mcp__hearthbot__message_coordinator', 'mcp__hearthbot__edit_message']) assert.equal(thread(t, 'M3', PLAN('doing')).post(DONE, other).status, 0, `only a post_message to yskills counts (${other})`)
})
