// M28 PR 1: plan, plan check and approval fields in the per-asset ledger file, and planReady() (plan 2026-11-12-M28-short-plan.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { readLedger, writeLedger } from '../global/gate-rounds.mjs'
import { approvalProblem, planCheckBrief, planChecksFromTranscript, planReady, recordApproval, registerPlan, visibleWork } from '../global/task-ledger.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const FIXTURE = join(root, 'scripts/fixtures/task-plan-ok.md')
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'))
  const plan = join(dir, 'PLAN.md')
  copyFileSync(FIXTURE, plan)
  return { dir, plan, done: () => rmSync(dir, { recursive: true, force: true }) }
}
const hashOf = (dir, asset) => readLedger(dir, asset).plan.hash
// The plan check is written only from the transcript (M28 PR 2): the test plays rule-guard with the Agent call and its tool_result.
const hook = (dir, asset, prompt, text, id = 'u1') => planChecksFromTranscript([
  { type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { prompt, model: 'opus' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] } },
].map((r) => JSON.stringify(r)).join('\n'), { dir, checklists: '' })
const checked = (dir, asset, result = 'pass') => hook(dir, asset, planCheckBrief(asset, { dir, checklists: '' }), `Plan check ${result}`)

test('planReady is false for a new asset, after registerPlan alone, and after a plan check without approval', () => {
  const t = setup()
  try {
    assert.equal(planReady('duck-hud', t.dir), false)
    registerPlan('duck-hud', t.plan, 's1', t.dir)
    assert.equal(planReady('duck-hud', t.dir), false)
    checked(t.dir, 'duck-hud')
    assert.equal(planReady('duck-hud', t.dir), false)
    recordApproval('duck-hud', { by: 'coordinator', ref: 'cmsg_x1' }, t.dir)
    assert.equal(planReady('duck-hud', t.dir), true)
  } finally { t.done() }
})

test('registerPlan refuses a failing PLAN.md and names every gap in one message', () => {
  const t = setup()
  try {
    writeFileSync(t.plan, readFileSync(FIXTURE, 'utf8').replace(/## Acceptance[\s\S]*?(?=## Gate point)/, '').replace(/## Risks[\s\S]*?(?=## Acceptance|## Gate point)/, ''))
    assert.throws(() => registerPlan('duck-hud', t.plan, 's1', t.dir), (e) => /Acceptance/.test(e.message) && /Risks/.test(e.message))
    assert.equal(readLedger(t.dir, 'duck-hud').plan, undefined, 'nothing was written')
  } finally { t.done() }
})

test('recordApproval refuses when the plan check is missing, failed, or belongs to an older hash', () => {
  const t = setup()
  try {
    registerPlan('duck-hud', t.plan, 's1', t.dir)
    assert.throws(() => recordApproval('duck-hud', { by: 'c', ref: 'cmsg_x1' }, t.dir), /plan check/)
    checked(t.dir, 'duck-hud', 'fail')
    assert.throws(() => recordApproval('duck-hud', { by: 'c', ref: 'cmsg_x1' }, t.dir), /plan check/)
    checked(t.dir, 'duck-hud', 'pass')
    const l = readLedger(t.dir, 'duck-hud')
    writeLedger(t.dir, { ...l, planCheck: { ...l.planCheck, plan_hash: 'old' } })
    assert.throws(() => recordApproval('duck-hud', { by: 'c', ref: 'cmsg_x1' }, t.dir), /plan check/)
  } finally { t.done() }
})

test('the door records nothing for an asset without a registered plan, nor for a plan edited since it was registered', () => {
  const t = setup()
  try {
    assert.deepEqual(hook(t.dir, 'duck-hud', 'Plan check: duck-hud\nx', 'Plan check pass'), [])
    assert.equal(readLedger(t.dir, 'duck-hud').planCheck, undefined)
    registerPlan('duck-hud', t.plan, 's1', t.dir)
    const prompt = planCheckBrief('duck-hud', { dir: t.dir, checklists: '' })
    writeFileSync(t.plan, `${readFileSync(t.plan, 'utf8')} `)
    assert.deepEqual(hook(t.dir, 'duck-hud', prompt, 'Plan check pass'), [])
    assert.equal(readLedger(t.dir, 'duck-hud').planCheck, undefined)
  } finally { t.done() }
})

test('editing PLAN.md after approval makes planReady false, re-registering alone does not bring it back', () => {
  const t = setup()
  try {
    registerPlan('duck-hud', t.plan, 's1', t.dir)
    checked(t.dir, 'duck-hud')
    recordApproval('duck-hud', { by: 'c', ref: 'cmsg_x1' }, t.dir)
    assert.equal(planReady('duck-hud', t.dir), true)
    writeFileSync(t.plan, `${readFileSync(t.plan, 'utf8')} `)
    assert.equal(planReady('duck-hud', t.dir), false, 'one character changed')
    registerPlan('duck-hud', t.plan, 's1', t.dir)
    assert.equal(planReady('duck-hud', t.dir), false, 'a new hash needs a new check and approval')
  } finally { t.done() }
})

test('a plan registered by a relative path is still found from another working directory', () => {
  const t = setup()
  const here = process.cwd()
  try {
    process.chdir(t.dir)
    registerPlan('duck-hud', 'PLAN.md', 's1', t.dir)
    checked(t.dir, 'duck-hud')
    recordApproval('duck-hud', { by: 'c', ref: 'cmsg_x1' }, t.dir)
    process.chdir(tmpdir())
    assert.equal(planReady('duck-hud', t.dir), true, 'the stored path is absolute')
  } finally { process.chdir(here); t.done() }
})

test('a ledger file that does not parse throws, nothing is reset', () => {
  const t = setup()
  try {
    registerPlan('duck-hud', t.plan, 's1', t.dir)
    const f = join(t.dir, 'duck-hud.json')
    writeFileSync(f, '{ broken')
    assert.throws(() => planReady('duck-hud', t.dir))
    assert.equal(readFileSync(f, 'utf8'), '{ broken')
  } finally { t.done() }
})

test('old ledger files without the new fields still read, and the new fields survive a round write', () => {
  const t = setup()
  try {
    mkdirSync(t.dir, { recursive: true })
    writeFileSync(join(t.dir, 'old.json'), JSON.stringify({ asset: 'old', rounds: [{ n: 1, score: 4.6, pass: true }], passed: true }))
    assert.equal(planReady('old', t.dir), false)
    assert.equal(readLedger(t.dir, 'old').rounds.length, 1)
    registerPlan('duck-hud', t.plan, 's1', t.dir)
    const l = readLedger(t.dir, 'duck-hud')
    writeLedger(t.dir, { ...l, rounds: [{ n: 1, score: 4.6, pass: true }] })
    assert.ok(readLedger(t.dir, 'duck-hud').plan.hash, 'the plan field is still there after the counter wrote')
  } finally { t.done() }
})

test('approval proof: visible work needs a card this session posted, pure code at M needs the coordinator message after the check', () => {
  const calls = [{ name: 'mcp__hearthbot__request_decision', result: '{"message_id":"cmsg_card1"}' }]
  assert.equal(visibleWork('Topic: HUD/UI', 'M'), true)
  assert.equal(visibleWork('Topic: none', 'L'), true)
  assert.equal(visibleWork('Topic: none', 'M'), false)
  assert.equal(approvalProblem({ visible: true, ref: 'cmsg_card1', calls }), null)
  assert.match(approvalProblem({ visible: true, ref: 'cmsg_other', calls }) ?? '', /card/)
  assert.equal(approvalProblem({ visible: false, ref: 'cmsg_msg1', humanAfter: () => true }), null)
  assert.match(approvalProblem({ visible: false, ref: 'cmsg_msg1', humanAfter: () => false }) ?? '', /message/)
})

test('the CLI has plan, approve and status, and no verb that writes the plan check', () => {
  const t = setup()
  try {
    const run = (...a) => spawnSync(process.execPath, [join(root, 'global/task-ledger.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, CLAUDE_SETUP_GATE_DIR: t.dir } })
    assert.equal(run('plan', 'duck-hud', t.plan).status, 0)
    assert.equal(JSON.parse(run('status', 'duck-hud').stdout).planReady, false)
    assert.notEqual(run('check', 'duck-hud', 'pass').status, 0, 'no verb writes planCheck')
    assert.notEqual(run('approve', 'duck-hud', 'cmsg_x1').status, 0, 'approve refuses without a passed plan check')
  } finally { t.done() }
})
