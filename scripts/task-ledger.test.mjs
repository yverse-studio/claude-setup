// M28 PR 1: plan, plan check and approval fields in the per-asset ledger file, and planReady() (plan 2026-11-12-M28-short-plan.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { readLedger, writeLedger } from '../global/gate-rounds.mjs'
import { approvalProblem, planReady, recordApproval, recordPlanCheck, registerPlan, visibleWork } from '../global/task-ledger.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const FIXTURE = join(root, 'scripts/fixtures/task-plan-ok.md')
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'))
  const plan = join(dir, 'PLAN.md')
  copyFileSync(FIXTURE, plan)
  return { dir, plan, done: () => rmSync(dir, { recursive: true, force: true }) }
}
const hashOf = (dir, asset) => readLedger(dir, asset).plan.hash
const checked = (dir, asset, result = 'pass') => recordPlanCheck(asset, { result, plan_hash: hashOf(dir, asset), brief_hash: 'b1', model: 'opus' }, dir)

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

test('recordPlanCheck refuses a hash that is not the registered plan, and an unknown result', () => {
  const t = setup()
  try {
    assert.throws(() => recordPlanCheck('duck-hud', { result: 'pass', plan_hash: 'h', brief_hash: 'b', model: 'm' }, t.dir), /no registered plan/)
    registerPlan('duck-hud', t.plan, 's1', t.dir)
    assert.throws(() => recordPlanCheck('duck-hud', { result: 'pass', plan_hash: 'other', brief_hash: 'b', model: 'm' }, t.dir), /not the registered plan/)
    assert.throws(() => recordPlanCheck('duck-hud', { result: 'maybe', plan_hash: hashOf(t.dir, 'duck-hud'), brief_hash: 'b', model: 'm' }, t.dir), /pass or fail/)
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
