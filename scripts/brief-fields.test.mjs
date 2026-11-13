// M50 slice A: the brief lines are ONE table (BRIEF_FIELDS in global/team-guard.mjs). The guard, the refusal's template and the template files read it;
// these tests prove it row by row and replay the live false starts of 2026-11-12. Run: node --test scripts/brief-fields.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { BRIEF_FIELDS } from '../global/team-guard.mjs'
import { briefCheck } from '../global/rule-guard.mjs'

process.env.PLAN_FILE = '/nonexistent/PLAN.json' // X1a: an item's lines count as part of the brief, so the live PLAN.json must not fill these rows
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
  assert.match(first, /Role: Researcher · Kit: <kit>[\s\S]*Item: <issue #n, PLAN\.json item/, 'the refusal carries the Researcher template')
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
  assert.match(director, /^Brief check[\s\S]*Programmer, [\s\S]*Reviewer[\s\S]*Role: Reviewer` \(or Designer\)/, 'the kit\'s thread roles and the gate director hint')
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

test('briefs.md keeps no hand-written brief block: a fenced block with a Role stamp would be a second source of BRIEF_FIELDS', () => {
  const briefs = readFileSync(join(root, '.claude/skills/operator/briefs.md'), 'utf8')
  for (const block of briefs.match(/```[\s\S]*?```/g) ?? []) assert.doesNotMatch(block, /^Role: .*Kit: .*Size:/m, 'a brief block lives in docs/templates/thread-brief.md only')
  assert.match(briefs, /rows of `BRIEF_FIELDS`/)
})

// X1b (#540): the item holds the rest. Its template has exactly these lines and the brief file names the item as the place for them.
const ITEM_LINES = ['Scope', 'Basis', 'Assets', 'Sheet', 'Look-Lock', 'Asset', 'Acceptance']
test('X1b: the issue template holds the item lines and every brief file points at the item for the rest', async () => {
  const tpl = readFileSync(join(root, '.github/ISSUE_TEMPLATE/plan.md'), 'utf8')
  assert.match(tpl, /^---\n[\s\S]*labels:.*plan/m, 'the template sets the plan label')
  for (const k of ITEM_LINES) assert.match(tpl, new RegExp(`^${k}:`, 'm'), `${k}: is an item line`)
  assert.doesNotMatch(tpl, /^Reuse:/m, 'Reuse: is the thread-reuse line, Assets: is the item line')
  const { briefFile } = await import('./brief.mjs')
  for (const role of ['Programmer', 'Reviewer', 'Researcher', 'Planner']) assert.match(briefFile(role), /Scope, Basis and Assets live in the item/, `${role} brief file names the item`)
})

// CompanyXY 2026-11-13 (brief-fix item 2): three starts of one Character TD each failed on a NEW line (Kit, then Gate, then model, then Sheet and Look-Lock).
// A wrong Kit hid the Sheet lines, and the model refusal named a tier, not the id to pass. One refusal now lists everything, the id included.
test('a brief with a wrong kit, a wrong model and no gate gets ONE refusal that also names Sheet, Look-Lock and the exact model id', async () => {
  const { decide } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const checklists = readFileSync(join(root, '.claude/skills/operator/checklists.md'), 'utf8')
  const id = (tier) => teams.match(new RegExp(`${tier} \\((claude-[\\w.-]+)\\)`))[1]
  const [opusId, sonnetId] = [id('Opus'), id('Sonnet')]
  const brief = ['Role: Character TD · Kit: references · Size: M', 'Item: new', 'Plan: p.md', 'Acceptance: ok', 'Model: opus', 'Skills: blender-body', 'Done when: x', 'Stop when: 3', 'Start: read MEMORY.md first', 'Threads: none open on this topic'].join('\n')
  const out = decide('mcp__hearthbot__start_thread', { prompt: brief, model: opusId, title: 'Character TD · Lily' }, [], [], teams, checklists, []).block
  for (const part of [/Kit: references is no kit/, /Gate:/, /Sheet:/, /Look-Lock:/, /Prior art/, new RegExp(`runs on sonnet \\(${sonnetId}\\)`)]) assert.match(out, part)
  // The same brief on a real kit lists the same gaps minus the kit: nothing new appears after the kit is fixed.
  const fixed = decide('mcp__hearthbot__start_thread', { prompt: brief.replace('references', 'game'), model: opusId, title: 'Character TD · Lily' }, [], [], teams, checklists, []).block
  for (const part of [/Gate:/, /Sheet:/, /Look-Lock:/, /Prior art/, new RegExp(`runs on sonnet \\(${sonnetId}\\)`)]) assert.match(fixed, part)
  // A kit that is none of the game or story kits keeps the Sheet lines away.
  const site = decide('mcp__hearthbot__start_thread', { prompt: brief.replace('references', 'site'), model: sonnetId, title: 'Character TD · Lily' }, [], [], teams, checklists, []).block
  assert.doesNotMatch(site ?? '', /Sheet:/)
})

// 2026-11-13 (coordinator, yskills 14:02): a brief said "at ~200k context post status and stop"; three needless hand-offs followed. A thread hands off only on a role change,
// quality loss or a milestone (docs/WORKFLOW.md, Handoff triggers), never at a token count, so a start brief with such a line is refused with that rule in the text.
test('a brief with a token-count stop or hand-off line is refused with the handoff rule; plain Stop when lines pass', async () => {
  const { briefProblems } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const sonnetId = teams.match(/Sonnet \((claude-[\w.-]+)\)/)[1]
  const base = ['Role: Programmer · Kit: setup · Size: S', 'Item: new', 'Plan: n/a, size S', 'Acceptance: ok', 'Threads: none open on this topic', 'Prior art: obra/superpowers -> adapt, because it exists', 'Skills: x', 'Done when: x', 'Start: read MEMORY.md first']
  const problems = (extra) => briefProblems([...base, ...extra, 'Stop when: 3 rounds'].join('\n'), { model: sonnetId, title: 'Programmer · x', teams })
  for (const bad of ['At ~200k context post status and stop.', 'Stop at 30000 tokens.', 'hand off at 250k tokens', 'Post a status when 80% of context is used, then stop.', 'Übergabe bei 200k Tokens', 'ÜBERGABE bei 200k Kontext', 'Stopp bei 250k Tokens, dann Übergabe', 'Bei 80% Kontext übergeben', 'Hand over at 200K context', 'Wrap up and report when context reaches 200k', 'Stop when: context is at 70 %', '- stop at 0.2M tokens', 'Bei 200k Kontext Status posten und stoppen', 'Do not go past 200k tokens: stop and post status', 'Beende den Thread bei 200k Tokens', 'Übergib bei 200k Token an den nächsten Thread', 'Stop when: context usage reaches 80 %']) {
    const out = problems([bad]).join('\n')
    assert.match(out, /token count[\s\S]*role change, quality loss or a milestone/, `refused: ${bad}`)
  }
  for (const ok of ['Stop when: 3 gate rounds without 5/5, then report', 'Output: a 4k px render', 'Tools and sources: docs/WORKFLOW.md, Handoff triggers', 'Acceptance: the endpoint answers status 200 for 100k users', 'Acceptance: HTTP status 404 for an unknown id, 2k rows seeded',
    'Acceptance: bundle stays under 250k, status check green', 'Acceptance: the texture is 4k and the status bar shows the frame', 'Acceptance: the stop button shows after 2k ms; 1.5k stars, status badge green',
    'Done when: the page loads for 100k users without a stop; status is "merged" and the file is under 50k bytes', 'Stop when: the render needs more than 8k samples; stop and ask before spending 5k EUR',
    'Item: #587 the brief check refuses a stop at 200k tokens', 'Plan: never stop at a token count (the 250k rule is outdated)', 'Stop when: 2 failed attempts, then post the status; <rounds or attempts, never tokens>',
    'Context: PR #588 at 1d53c9b, round 1 report in the PR comment', 'Context: 3 PRs open, status in the board', 'Kontext: Runde 2, Bericht der Runde 1 liegt im PR', 'Objective: stop the regression where context 3 of 5 tabs loses state',
    'Acceptance: MEMORY.md stays under 2k tokens; report the count', 'Done when: the summary fits in 500 tokens and the PR status is green', 'Acceptance: rate limit of 100 tokens per minute, status 429 after that',
    'Acceptance: the model call sets max 1024 tokens and a stop sequence', 'Tools: docs/WORKFLOW.md Token budget (a gate thread starts at ~114k tokens), report in under 30 lines', 'Acceptance: the prompt stays under 8k tokens; report the measured size']) assert.doesNotMatch(problems([ok]).join('\n'), /token count/, `passes: ${ok}`)
})
