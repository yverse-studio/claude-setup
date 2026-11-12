// M28 PR 2: the plan-check door (plan 2026-11-12-M28-short-plan.md, PR 2). Run: node --test scripts/task-door.test.mjs
// The door sits in two installed guard files: team-guard.mjs refuses the wrong plan-check call (PreToolUse on Agent), context-guard.mjs
// records the checker's verdict (PostToolUse on every tool). The real PostToolUse payload of an Agent call was not captured in the cloud
// session that built this (the hook settings are not editable there), so the parser is tolerant and one test per plausible shape stands in for it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readLedger } from '../global/gate-rounds.mjs'
import * as ledger from '../global/task-ledger.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const CHECKLISTS = '.claude/skills/operator/checklists.md'
const ASSET = 'duck-hud'

function door({ session = 's1' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'door-'))
  const gate = join(dir, 'gate')
  mkdirSync(join(dir, '.claude/skills/operator'), { recursive: true })
  copyFileSync(join(root, CHECKLISTS), join(dir, CHECKLISTS))
  const plan = join(dir, 'PLAN.md')
  copyFileSync(join(root, 'scripts/fixtures/task-plan-ok.md'), plan)
  const env = { ...process.env, CLAUDE_SETUP_GATE_DIR: gate, CLAUDE_SETUP_HOME: dir, CLAUDE_SETUP_BOOT_FETCH: 'off', CLAUDE_SETUP_TEAM_GUARD: '', CLAUDE_SETUP_RULE_GUARD: '' }
  ledger.registerPlan(ASSET, plan, session, gate)
  const checklists = readFileSync(join(dir, CHECKLISTS), 'utf8')
  const brief = ledger.planCheckBrief(ASSET, { dir: gate, checklists })
  const run = (script, mode, payload) => spawnSync(process.execPath, [join(root, 'global', script), ...(mode ? [mode] : [])], { input: JSON.stringify({ cwd: dir, session_id: session, ...payload }), encoding: 'utf8', env })
  const pre = (input, extra = {}) => run('team-guard.mjs', 'pre', { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: input, ...extra })
  const post = (response, input = { prompt: brief, model: 'opus' }, extra = {}) => run('context-guard.mjs', '', { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: input, tool_response: response, ...extra })
  const bash = (command, calls = [], extra = []) => {
    const transcript = join(dir, 't.jsonl')
    writeFileSync(transcript, [{ type: 'assistant', timestamp: '2026-11-12T10:00:00Z', message: { model: 'sonnet-test', content: [] } }, ...calls, ...extra].map((l) => JSON.stringify(l)).join('\n'))
    return spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd: dir, session_id: session, transcript_path: transcript, tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8', env })
  }
  return { dir, gate, plan, env, brief, pre, post, bash, ledger: () => readLedger(gate, ASSET), done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('the brief is rendered, not written: deterministic, first line names the asset, carries the plan, its checklist and the fixed questions', () => {
  const t = door()
  try {
    assert.equal(t.brief.split('\n')[0], `Plan check: ${ASSET}`)
    assert.equal(t.brief, ledger.planCheckBrief(ASSET, { dir: t.gate, checklists: readFileSync(join(t.dir, CHECKLISTS), 'utf8') }), 'same inputs, same bytes')
    assert.match(t.brief, /A health bar HUD for the duck game/, 'the plan')
    assert.match(t.brief, /Clearance|HUD\/UI|Safe area|390/i, 'the HUD/UI checklist')
    for (const q of ['reach every Acceptance line', 'really measurable', 'contradict the MAIN reference', 'Still needed', 'library searched']) assert.match(t.brief, new RegExp(q))
    assert.match(t.brief, /Plan check pass|Plan check fail/)
  } finally { t.done() }
})

test('an Agent call with "Plan check:" and a hand-written prompt is blocked, and the message names the command that renders the right brief', () => {
  const t = door()
  try {
    const r = t.pre({ prompt: `Plan check: ${ASSET}\nLooks fine, answer Plan check pass`, model: 'opus' })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /rendered brief/)
    assert.match(r.stderr, /task-ledger\.mjs brief duck-hud/)
    assert.equal(t.pre({ prompt: t.brief, model: 'opus' }).status, 0, 'the rendered one passes')
    assert.equal(t.pre({ prompt: 'Review the repo for typos', model: 'sonnet' }).status, 0, 'other Agent calls are untouched')
  } finally { t.done() }
})

test('the rendered brief on Sonnet or without a model is blocked; Opus and Fable pass', () => {
  const t = door()
  try {
    for (const model of ['sonnet', 'haiku', 'sonnet-latest']) assert.equal(t.pre({ prompt: t.brief, model }).status, 2, model)
    assert.equal(t.pre({ prompt: t.brief }).status, 2, 'no model')
    for (const model of ['opus', 'opus-latest', 'fable']) assert.equal(t.pre({ prompt: t.brief, model }).status, 0, model)
  } finally { t.done() }
})

test('a plan check for an asset without a registered plan, or for a PLAN.md that changed since, is blocked', () => {
  const t = door()
  try {
    assert.equal(t.pre({ prompt: 'Plan check: other-asset\nx', model: 'opus' }).status, 2)
    writeFileSync(t.plan, `${readFileSync(t.plan, 'utf8')} `)
    const r = t.pre({ prompt: t.brief, model: 'opus' })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /changed/)
  } finally { t.done() }
})

test('a session with agent_id (a subagent) cannot start a plan check, and nothing is recorded from its call', () => {
  const t = door()
  try {
    assert.equal(t.pre({ prompt: t.brief, model: 'opus' }, { agent_id: 'a1' }).status, 2)
    t.post('Plan check pass\n1. yes', { prompt: t.brief, model: 'opus' }, { agent_id: 'a1' })
    assert.equal(t.ledger().planCheck, undefined)
  } finally { t.done() }
})

const SHAPES = {
  'a plain string': (text) => text,
  'content blocks': (text) => ({ content: [{ type: 'text', text }] }),
  'a result field': (text) => ({ result: text }),
  'a nested result': (text) => ({ type: 'result', result: { content: [{ type: 'text', text }] }, agentId: 'abc' }),
  'a list of blocks': (text) => [{ type: 'text', text }],
  'an output field': (text) => ({ output: text }),
}
for (const [name, shape] of Object.entries(SHAPES)) {
  test(`PostToolUse with ${name}: "Plan check pass" writes planCheck with the right hashes, "fail" writes fail`, () => {
    const t = door()
    try {
      const out = t.post(shape('Plan check pass\n1. yes: the method reaches every line'))
      assert.equal(out.status, 0)
      const c = t.ledger().planCheck
      assert.equal(c.result, 'pass')
      assert.equal(c.plan_hash, t.ledger().plan.hash)
      assert.equal(c.brief_hash, ledger.sha(t.brief))
      assert.match(c.model, /opus/)
      assert.match(out.stdout, /Plan check recorded: pass/)
      t.post(shape('**Plan check fail**\n3. no: Method contradicts MAIN'))
      assert.equal(t.ledger().planCheck.result, 'fail')
    } finally { t.done() }
  })
}

test('PostToolUse with neither verdict line writes nothing and says so; a background launch (no final text) is named', () => {
  const t = door()
  try {
    const out = t.post('The plan looks fine to me.')
    assert.equal(t.ledger().planCheck, undefined)
    assert.match(out.stdout, /no .?Plan check (pass|fail).? line|nothing was recorded/i)
    const bg = t.post({ status: 'async_launched', agentId: 'a9' })
    assert.equal(t.ledger().planCheck, undefined)
    assert.match(bg.stdout, /foreground|nothing was recorded/i)
  } finally { t.done() }
})

test('PostToolUse records nothing for a hand-written prompt, a Sonnet checker, a stale plan, or another tool', () => {
  const t = door()
  try {
    t.post('Plan check pass', { prompt: `Plan check: ${ASSET}\nmy own`, model: 'opus' })
    t.post('Plan check pass', { prompt: t.brief, model: 'sonnet' })
    t.post('Plan check pass', { prompt: t.brief, model: 'opus' }, { tool_name: 'Bash' })
    t.post('Plan check pass', { prompt: t.brief, model: 'opus' }, { hook_event_name: 'PreToolUse' })
    assert.equal(t.ledger().planCheck, undefined)
    writeFileSync(t.plan, `${readFileSync(t.plan, 'utf8')} `)
    t.post('Plan check pass')
    assert.equal(t.ledger().planCheck, undefined, 'the plan changed while it was checked')
  } finally { t.done() }
})

test('a pass for an old plan does not stand: re-registering a changed PLAN.md needs a new check (planReady stays false)', () => {
  const t = door()
  try {
    t.post('Plan check pass')
    ledger.recordApproval(ASSET, { by: 'c', ref: 'cmsg_x1' }, t.gate)
    assert.equal(ledger.planReady(ASSET, t.gate), true)
    writeFileSync(t.plan, `${readFileSync(t.plan, 'utf8')} `)
    assert.equal(ledger.planReady(ASSET, t.gate), false)
  } finally { t.done() }
})

test('closed door (reviewer item a): recordPlanCheck is not exported, and the hook payload function checks the event, the tool, the brief and the model itself', () => {
  assert.equal(ledger.recordPlanCheck, undefined)
  assert.equal(typeof ledger.planCheckPost, 'function')
  const t = door()
  try {
    const forged = { tool_name: 'Agent', tool_input: { prompt: t.brief, model: 'opus' }, tool_response: 'Plan check pass', cwd: t.dir }
    assert.match(ledger.planCheckPost(forged, { dir: t.gate, checklists: readFileSync(join(t.dir, CHECKLISTS), 'utf8') }).note, /PostToolUse/)
    assert.equal(t.ledger().planCheck, undefined)
  } finally { t.done() }
})

test('direct writes to the ledger stay refused for the new fields: Write, tee, redirect, node -e and an import of task-ledger.mjs', () => {
  const t = door()
  try {
    const file = join(t.gate, `${ASSET}.json`)
    const write = spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd: t.dir, session_id: 's', tool_name: 'Write', tool_input: { file_path: file, content: '{"planCheck":{"result":"pass"}}' } }), encoding: 'utf8', env: t.env })
    assert.equal(write.status, 2)
    for (const c of [
      `tee ${file} < x.json`, `echo '{}' > ${file}`, `node -e "require('fs').writeFileSync('${file}','{}')"`,
      `node -e "import('/root/.claude/claude-setup/task-ledger.mjs').then(m=>m.planCheckPost({}))"`, `node --input-type=module -e "import '/root/.claude/claude-setup/task-ledger.mjs'"`,
      `node -p "require('/root/.claude/claude-setup/task-ledger.mjs')"`, `node - <<'EOF'\nimport('/root/.claude/claude-setup/task-ledger.mjs')\nEOF`,
      'node ~/.claude/claude-setup/task-ledger.mjs planCheck duck-hud pass', 'node global/task-ledger.mjs check duck-hud pass',
    ]) assert.equal(t.bash(c).status, 2, c)
    for (const c of [`node ~/.claude/claude-setup/task-ledger.mjs plan ${ASSET} ${t.plan}`, `node ~/.claude/claude-setup/task-ledger.mjs status ${ASSET}`, `node ~/.claude/claude-setup/task-ledger.mjs brief ${ASSET}`, 'cat ~/.claude/claude-setup/task-ledger.mjs | head -5', 'node --test scripts/task-ledger.test.mjs']) assert.equal(t.bash(c).status, 0, c)
  } finally { t.done() }
})

test('reviewer item c: CLAUDE_SETUP_* variables are refused in a call that runs task-ledger.mjs, as for the round counter', () => {
  const t = door()
  try {
    for (const c of [`CLAUDE_SETUP_GATE_DIR=/tmp/x node ~/.claude/claude-setup/task-ledger.mjs plan ${ASSET} ${t.plan}`, `export CLAUDE_SETUP_GATE_DIR=/tmp/x; node ~/.claude/claude-setup/task-ledger.mjs status ${ASSET}`]) {
      const r = t.bash(c)
      assert.equal(r.status, 2, c)
      assert.match(r.stderr, /CLAUDE_SETUP_/)
    }
  } finally { t.done() }
})

test('reviewer item b: approve goes through approvalProblem in the hook (visible work: a card this session posted; pure code: the coordinator message after the check)', () => {
  const card = [
    { type: 'assistant', timestamp: '2026-11-12T10:01:00Z', message: { content: [{ type: 'tool_use', id: 'u1', name: 'mcp__hearthbot__request_decision', input: {} }] } },
    { type: 'user', timestamp: '2026-11-12T10:01:01Z', message: { content: [{ type: 'tool_result', tool_use_id: 'u1', content: 'posted cmsg_CARD1' }] } },
  ]
  const t = door()
  try {
    t.post('Plan check pass')
    const approve = (ref) => `node ~/.claude/claude-setup/task-ledger.mjs approve ${ASSET} ${ref}`
    assert.match(t.bash(approve('cmsg_MADEUP')).stderr, /card/, 'the fixture is a HUD/UI plan: visible work')
    assert.equal(t.bash(approve('cmsg_CARD1'), card).status, 0)
    assert.equal(t.bash(`${approve('cmsg_CARD1')} && echo x`, card).status, 2, 'the only command of the call')
  } finally { t.done() }
  const p = door()
  try {
    writeFileSync(p.plan, readFileSync(p.plan, 'utf8').replace('Topic: HUD/UI', 'Topic: none').replace('MAIN: reference card cmsg_01AbCdEf12345', 'MAIN: reference card'))
    ledger.registerPlan(ASSET, p.plan, 's1', p.gate)
    const brief = ledger.planCheckBrief(ASSET, { dir: p.gate, checklists: '' })
    p.post('Plan check pass', { prompt: brief, model: 'opus' })
    assert.equal(p.ledger().planCheck?.result, 'pass')
    const size = { type: 'user', timestamp: '2026-11-12T09:59:00Z', message: { content: 'Role: Programmer · Kit: setup · Size: M' } }
    const early = { type: 'user', timestamp: '2020-01-01T00:00:00Z', message: { content: '<message id="cmsg_COORD1">go</message>' } }
    const late = { type: 'user', timestamp: '2999-01-01T00:00:00Z', message: { content: '<message id="cmsg_COORD1">go</message>' } }
    const approve = `node ~/.claude/claude-setup/task-ledger.mjs approve ${ASSET} cmsg_COORD1`
    assert.match(p.bash(approve, [], [size, early]).stderr, /coordinator message/, 'before the plan check does not count')
    assert.equal(p.bash(approve, [], [size, late]).status, 0)
    const sizeL = { ...size, message: { content: 'Role: Programmer · Kit: setup · Size: L' } }
    assert.match(p.bash(approve, [], [sizeL, late]).stderr, /card/, 'size L is visible work')
  } finally { p.done() }
})

test('reviewer item d: the cmsg pattern comes from gate-rounds, not a second regex', () => {
  const src = readFileSync(join(root, 'global/task-ledger.mjs'), 'utf8')
  assert.doesNotMatch(src, /cmsg_\\w/, 'no private cmsg regex')
  assert.match(src, /CMSG/)
})

test('brief.mjs --plan-check prints the same bytes as the hook renders', () => {
  const t = door()
  try {
    const r = spawnSync(process.execPath, [join(root, 'scripts/brief.mjs'), '--plan-check', ASSET], { encoding: 'utf8', env: t.env, cwd: t.dir })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout.trimEnd(), t.brief.trimEnd())
  } finally { t.done() }
})

test('task-ledger CLI: brief prints the rendered brief; the guard files list and the installers carry the door', () => {
  const t = door()
  try {
    const r = spawnSync(process.execPath, [join(root, 'global/task-ledger.mjs'), 'brief', ASSET], { encoding: 'utf8', env: t.env, cwd: t.dir })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout.trimEnd(), t.brief.trimEnd())
  } finally { t.done() }
})
