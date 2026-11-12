// M50 slice A: the brief lines are ONE table (BRIEF_FIELDS in global/team-guard.mjs). The guard, the refusal's template and the template files read it;
// these tests prove it row by row and replay the live false starts of 2026-11-12. Run: node --test scripts/brief-fields.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { BRIEF_FIELDS } from '../global/team-guard.mjs'
import { briefCheck } from '../global/rule-guard.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const spawn = (brief) => `<wake reason="spawn"><relay>${brief}</relay></wake>`
const check = (brief, model = null) => briefCheck(spawn(brief), root, model)
const LINES = { Item: 'Item: M50', Plan: 'Plan: p.md', Acceptance: 'Acceptance: tests pass', Model: 'Model: sonnet', Skills: 'Skills: .claude/skills/operator/roles/programmer.md',
  'Done when': 'Done when: tests pass', 'Stop when': 'Stop when: 3 rounds', Start: 'Start: read MEMORY.md first', Threads: 'Threads: list_threads checked, none open on this topic',
  'Prior art': 'Prior art: obra/superpowers -> adapt, because it exists', Gate: 'Gate: Reviewer · x before owner', Sheet: 'Sheet: sheet.md', 'Look-Lock': 'Look-Lock: card https://x.y/z',
  Researcher: 'Researcher: Opus subagent', Tester: 'Tester: Tester · app' }

test('table test: a brief that lacks only one row gets exactly that row\'s class behaviour', async () => {
  for (const f of BRIEF_FIELDS) {
    const stamp = ['Sheet', 'Look-Lock'].includes(f.key) ? 'Programmer · Kit: game · Size: M' : f.key === 'Tester' ? 'Programmer · Kit: setup · Size: L' : 'Programmer · Kit: setup · Size: M'
    const brief = [`Role: ${stamp}`, 'Research SOTA of the thing.', ...Object.entries(LINES).filter(([k]) => k !== f.key).map(([, l]) => l)].join('\n')
    const out = await check(brief)
    if (['Acceptance', 'Done when'].includes(f.key)) { assert.doesNotMatch(out, /^Brief (check|repair)[^\n]*(Acceptance|Done when)/, `${f.key}: the other one satisfies both`); continue }
    const cls = f.cls(brief.replace(/[*_`]/g, ''))
    if (cls === 'judgment') { assert.match(out, new RegExp(`^Brief check[\\s\\S]*${f.key}`), `${f.key}: one refusal names it`); assert.match(out, /Role: Programmer · Kit: <kit>/, `${f.key}: the refusal carries the role's template`) }
    else { assert.doesNotMatch(out, /^Brief check/, `${f.key} (${cls}) never blocks`); assert.match(out, new RegExp(`^Brief repair[^\\n]*lacks[^\\n]*${f.key}`), `${f.key}: the thread is told how it closes the gap`) }
  }
  // Acceptance and Done when are one datum: either satisfies both, both missing at size M is a judgment gap.
  const both = await check(['Role: Programmer · Kit: setup · Size: M', ...Object.entries(LINES).filter(([k]) => !['Acceptance', 'Done when'].includes(k)).map(([, l]) => l)].join('\n'))
  assert.match(both, /^Brief check[\s\S]*Acceptance/)
  assert.equal((await check(['Role: Programmer · Kit: setup · Size: M', ...Object.entries(LINES).filter(([k]) => k !== 'Done when').map(([, l]) => l)].join('\n'))).startsWith('Brief'), false, 'Acceptance alone is enough')
})

// The templates and the guard read one source: every template line is a row, every row is in the template file.
test('the template file, the generated brief files and the refusal carry exactly the rows of BRIEF_FIELDS', async () => {
  const keyOf = (l) => l.match(/^([A-Z][\w -]*?):/)?.[1]
  const EXTRA = ['Role', 'Round', 'Asset', 'Picture card', 'Topic', 'Gate'] // stamp and gate-round lines the guard reads elsewhere
  const template = readFileSync(join(root, 'docs/templates/thread-brief.md'), 'utf8').match(/```\n([\s\S]*?)```/)[1].split('\n').filter(Boolean)
  const keys = BRIEF_FIELDS.map((f) => f.key)
  for (const l of template) assert.ok(keys.includes(keyOf(l)) || EXTRA.includes(keyOf(l)), `template line "${keyOf(l)}" is a BRIEF_FIELDS row`)
  for (const f of BRIEF_FIELDS) assert.ok(template.some((l) => keyOf(l) === f.key), `row ${f.key} is in docs/templates/thread-brief.md`)
  const { briefFile } = await import('./brief.mjs')
  for (const role of ['Programmer', 'Reviewer', 'Researcher', 'Planner']) {
    const block = briefFile(role).match(/```\n([\s\S]*?)```/)[1].split('\n').filter(Boolean)
    for (const l of block) assert.ok(keys.includes(keyOf(l)) || EXTRA.includes(keyOf(l)), `${role} brief file line "${keyOf(l)}" is a row`)
  }
  const prog = briefFile('Programmer').match(/```\n([\s\S]*?)```/)[1]
  for (const f of BRIEF_FIELDS.filter((r) => !r.applies && r.key !== 'Prior art' && r.key !== 'Tester')) assert.ok(prog.split('\n').some((l) => keyOf(l) === f.key), `row ${f.key} is in the Programmer brief file`)
  const refusal = await check('Role: Researcher · Kit: research · Size: M\nItem: PLAN.json item M29')
  for (const f of BRIEF_FIELDS.filter((r) => !r.applies)) assert.ok(refusal.includes(f.tpl), `the refusal's template has the ${f.key} line`)
})

// The live false starts of 2026-11-12 (plan section 1 and the coordinator's two Researcher starts of 16:40).
const FULL_M = Object.values(LINES).join('\n')
test('live fixtures: the Researcher start of 16:40 gets one refusal with every error and the template, and its restart passes', async () => {
  const first = await check(`Role: Researcher · Kit: research · Size: M\nItem: PLAN.json item M29\nThreads: none\nPlan: p.md\nAcceptance: ok\nModel: opus\nSkills: s\nStart: read MEMORY.md first\nDone when: x\nStop when: y\nPrior art: .claude/skills/operator/gate.md -> adapt, because it exists`)
  assert.match(first, /^Brief check[\s\S]*Kit: research is no kit/, 'the kit is refused')
  assert.doesNotMatch(first.split('\n')[0], /Item|Threads/, 'Item and Threads are no refusal: the format is repaired, the thread lists threads itself')
  assert.match(first, /Role: Researcher · Kit: <kit>[\s\S]*Item: <PLAN\.json item/, 'the refusal carries the Researcher template')
  const second = await check(`Role: Researcher · Kit: setup · Size: M\nItem: PLAN.json item M29\nThreads: none\nPlan: p.md\nAcceptance: ok\nModel: opus\nSkills: s\nStart: read MEMORY.md first\nDone when: x\nStop when: y\nPrior art: .claude/skills/operator/gate.md -> adapt, because it exists`)
  assert.doesNotMatch(second, /^Brief check/, 'the restart is not refused')
  assert.match(second, /^Brief repair[^\n]*Item[^\n]*Threads|^Brief repair[^\n]*Threads[^\n]*Item/, 'the repairs are named')
  assert.match(second, /Item: M29/, 'Item: PLAN.json item M29 counts as M29')
})
test('live fixtures: the Gate line without "before owner" is repaired, a Director and a missing Role get one refusal, a size L Programmer needs its Tester', async () => {
  const noOwner = await check(FULL_M.replace('Gate: Reviewer · x before owner', 'Gate: Reviewer · Gate brief-fix plan M50 (cmsg_1)').replace(/^/, 'Role: Programmer · Kit: setup · Size: M\n'))
  assert.doesNotMatch(noOwner, /^Brief check/)
  assert.match(noOwner, /^Brief repair[^\n]*Gate[\s\S]*before owner/, 'precisely reported: what the thread does about the Gate line')
  const director = await check(`Role: Director · Kit: setup · Size: M\n${FULL_M}`)
  assert.match(director, /^Brief check[\s\S]*Programmer, [\s\S]*Reviewer[\s\S]*Role: Reviewer/, 'the kit\'s thread roles and the gate director hint')
  assert.doesNotMatch(await check(`Role: Director · Kit: video · Size: M\n${FULL_M}`), /^Brief check/, 'a Director on the video kit is a valid start, the gate hint rides only on a refusal')
  assert.match(await check(`Role: Programmer · Kit: setup · Size: M\n${FULL_M.replace('Item: M50', 'Item: <PLAN.json item M<n> or new>')}`), /^Brief check[\s\S]*Item is missing/, 'the untouched Item placeholder is refused at size M')
  assert.match(await check(`Kit: setup · Size: M\n${FULL_M}`), /^Brief check[\s\S]*no `Role: · Kit: · Size:` stamp/)
  assert.match(await check(`Role: Programmer · Kit: setup · Size: L\n${FULL_M.replace('Tester: Tester · app\n', '').replace(/\nTester:.*$/, '')}`), /^Brief check[\s\S]*Tester/)
  const noPrior = await check(`Role: Programmer · Kit: setup · Size: M\n${FULL_M.replace(/Prior art:[^\n]*\n/, '')}`)
  assert.match(noPrior, /^Brief repair[\s\S]*Prior art: to find:/, 'a builder without Prior art gets `to find:`')
})
test('live fixtures: gaps in three categories come in one refusal, the wrong model included', async () => {
  const out = await check(`Role: Designer · Kit: content · Size: M\nFix it.`, 'claude-haiku-x')
  assert.match(out, /^Brief check[^\n]*in (3|4|5|6) places[\s\S]*Kit: content is no kit[\s\S]*Plan is missing[\s\S]*runs on haiku/)
})

test('a Planner is a gate-builder role: an M brief without a Gate line is named by missingLines, and its brief file carries the line', async () => {
  const { missingLines } = await import('../global/team-guard.mjs')
  const { briefFile } = await import('./brief.mjs')
  const planner = (gate) => ['Role: Planner · Kit: setup · Size: M', ...(gate ? ['Gate: Reviewer · plan round 1 before owner'] : [])].join('\n')
  assert.match(missingLines(planner(false)).join('\n'), /Gate:/)
  assert.doesNotMatch(missingLines(planner(true)).join('\n'), /Gate:/)
  assert.match(briefFile('Planner'), /^Gate:/m)
})
