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
  'Prior art': 'Prior art: obra/superpowers -> adapt, because it exists', Gate: 'Gate: Reviewer · x before owner', Sheet: 'Sheet: sheet.md', 'Target image': 'Target image: lib/characters/CH_x/approval/A.png', Source: 'Source: lib/characters/CH_x/source/A.blend',
  Researcher: 'Researcher: Opus subagent', Tester: 'Tester: Tester · app', 'Pre-gate': 'Pre-gate: gate/bikini/PREGATE.md',
  Level: 'Level: research research/airport.md · plan plans/airport-PLAN.md · design design/airport.md' }

test('table test: a brief that lacks only one row gets exactly that row\'s class behaviour', async () => {
  for (const f of BRIEF_FIELDS) {
    const stamp = f.key === 'Pre-gate' ? 'Animator · Kit: game · Size: M' : ['Sheet', 'Target image', 'Source'].includes(f.key) ? 'Programmer · Kit: game · Size: M' : ['Tester', 'Gate'].includes(f.key) ? 'Programmer · Kit: setup · Size: L' : 'Programmer · Kit: setup · Size: M'
    const brief = [`Role: ${f.key === 'Level' ? 'Programmer · Kit: game · Size: M' : stamp}`, f.key === 'Level' ? 'Research SOTA of the thing for the airport level.' : 'Research SOTA of the thing.', ...Object.entries(LINES).filter(([k]) => k !== f.key).map(([, l]) => l)].join('\n')
    const out = await check(brief)
    if (['Acceptance', 'Done when'].includes(f.key)) { assert.doesNotMatch(out, /^Brief (check|repair)[^\n]*(Acceptance|Done when)/, `${f.key}: the other one satisfies both`); continue }
    const cls = f.cls(brief.replace(/[*_`]/g, ''))
    if (cls === 'judgment') { assert.match(out, new RegExp(`^Brief check[\\s\\S]*${f.key}`), `${f.key}: one refusal names it`); assert.match(out, /Role: Programmer · Kit: <kit>/, `${f.key}: the refusal carries the role's template`) }
    else { assert.doesNotMatch(out, /^Brief check/, `${f.key} (${cls}) never blocks`); assert.match(out, new RegExp(cls === 'derived' ? `^Brief fill:[^\\n]*${f.key}:` : `^Brief repair[^\\n]*lacks[^\\n]*${f.key}`, 'm'), `${f.key}: the thread is told how it closes the gap`) }
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
// #761: a loose stamp line is read as the canonical one; a game-kit Game Designer without Level stays locked.
test('#761: `Role · Kit · Size: Reviewer · setup · M` passes the brief check, an unknown kit in it does not, the Level lock stays', async () => {
  const refusal = /Brief check[^\n]*breaks the team rules|no `Role: · Kit: · Size:` stamp line/
  assert.doesNotMatch(await check(`Role · Kit · Size: Reviewer · setup · M\n${FULL_M}`), refusal)
  assert.doesNotMatch(await check(`Role | Kit | Size: Reviewer | setup | M\n${FULL_M}`), refusal)
  assert.match(await check(`Role · Kit · Size: Reviewer · nonsense · M\n${FULL_M}`), /Brief check[\s\S]*Kit: nonsense is no kit/)
  const noLevel = FULL_M.split('\n').filter((l) => !l.startsWith('Level:')).join('\n')
  assert.match(await check(`Role: Game Designer · Kit: game · Size: M\n${noLevel}`), /^Brief check[\s\S]*Level/)
  assert.match(await check(`Role: Game Designer · Kit: game · Size: M\nItem: M50\n${noLevel}`), /^Brief check[\s\S]*Level/)
})

test('live fixtures: the Researcher start of 16:40 gets one refusal with every error and the template, and its restart passes', async () => {
  const first = await check(`Role: Researcher · Kit: research · Size: M\nItem: PLAN.json item M29\nThreads: none\nPlan: p.md\nAcceptance: ok\nModel: opus\nSkills: s\nStart: read MEMORY.md first\nDone when: x\nStop when: y\nPrior art: .claude/skills/operator/gate.md -> adapt, because it exists`)
  assert.match(first, /^Brief check[\s\S]*Kit: research is no kit/, 'the kit is refused')
  assert.doesNotMatch(first.split('\n')[0], /Item|Threads/, 'Item and Threads are no refusal: the format is repaired, the thread lists threads itself')
  assert.match(first, /Role: Researcher · Kit: <kit>[\s\S]*Item: <issue #n, M<n> or new>/, 'the refusal carries the Researcher template')
  const second = await check(`Role: Researcher · Kit: setup · Size: M\nItem: PLAN.json item M29\nThreads: none\nPlan: p.md\nAcceptance: ok\nModel: opus\nSkills: s\nStart: read MEMORY.md first\nDone when: x\nStop when: y\nPrior art: .claude/skills/operator/gate.md -> adapt, because it exists`)
  assert.doesNotMatch(second, /^Brief check/, 'the restart is not refused')
  assert.match(second, /^Brief repair[^\n]*lacks Threads/m, 'the repair is named')
  assert.match(second, /^Brief fill:[^\n]*Item: M29/m, 'the fill is named')
  assert.match(second, /Item: M29/, 'Item: PLAN.json item M29 counts as M29')
})
test('live fixtures: the Gate line without "before owner" is repaired, a Director and a missing Role get one refusal, a size L Programmer needs its Tester', async () => {
  const noOwner = await check(FULL_M.replace('Gate: Reviewer · x before owner', 'Gate: Reviewer · Gate brief-fix plan M50 (cmsg_1)').replace(/^/, 'Role: Programmer · Kit: setup · Size: L\nTester: Tester · x\n'))
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

test('a Planner is a gate-builder role: an L brief without a Gate line is a recoverable gap (classify, not missingLines), an M brief has none, and its brief file carries the line', async () => {
  const { classify } = await import('../global/team-guard.mjs')
  const gaps = (b) => classify(b).recoverable.map((f) => f.key).join('\n')
  const { briefFile } = await import('./brief.mjs')
  const planner = (gate, size = 'L') => [`Role: Planner · Kit: setup · Size: ${size}`, ...(gate ? ['Gate: Reviewer · plan round 1 before owner'] : [])].join('\n')
  assert.match(gaps(planner(false)), /Gate/)
  assert.doesNotMatch(gaps(planner(true)), /Gate/)
  assert.doesNotMatch(gaps(planner(false, 'M')), /Gate/, 'size M: the gate runs in the thread (#780)')
  assert.match(briefFile('Planner'), /^Gate:/m)
})

test('briefs.md keeps no hand-written brief block: a fenced block with a Role stamp would be a second source of BRIEF_FIELDS', () => {
  const briefs = readFileSync(join(root, '.claude/skills/operator/briefs.md'), 'utf8')
  for (const block of briefs.match(/```[\s\S]*?```/g) ?? []) assert.doesNotMatch(block, /^Role: .*Kit: .*Size:/m, 'a brief block lives in docs/templates/thread-brief.md only')
  assert.match(briefs, /rows of `BRIEF_FIELDS`/)
})

// X1b (#540): the item holds the rest. Its template has exactly these lines and the brief file names the item as the place for them.
const ITEM_LINES = ['Scope', 'Basis', 'Assets', 'Sheet', 'Target image', 'Source', 'Asset', 'Acceptance']
test('X1b: the issue template holds the item lines and every brief file points at the item for the rest', async () => {
  const tpl = readFileSync(join(root, '.github/ISSUE_TEMPLATE/plan.md'), 'utf8')
  assert.match(tpl, /^---\n[\s\S]*labels:.*plan/m, 'the template sets the plan label')
  for (const k of ITEM_LINES) assert.match(tpl, new RegExp(`^${k}:`, 'm'), `${k}: is an item line`)
  assert.doesNotMatch(tpl, /^Reuse:/m, 'Reuse: is the thread-reuse line, Assets: is the item line')
  const { briefFile } = await import('./brief.mjs')
  for (const role of ['Programmer', 'Reviewer', 'Researcher', 'Planner']) assert.match(briefFile(role), /Scope, Basis and Assets live in the item/, `${role} brief file names the item`)
})

// CompanyXY 2026-11-13 (brief-fix item 2): three starts of one Character TD each failed on a NEW line (Kit, then Gate, then model, then Sheet and the look lines).
// A wrong Kit hid the Sheet lines, and the model refusal named a tier, not the id to pass. One refusal now lists everything, the id included.
test('a brief with a wrong kit, a wrong model and no gate gets ONE refusal that also names Sheet, Target image, Source and the exact model id', async () => {
  const { decide } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const checklists = readFileSync(join(root, '.claude/skills/operator/checklists.md'), 'utf8')
  const id = (tier) => teams.match(new RegExp(`${tier} \\((claude-[\\w.-]+)\\)`))[1]
  const [opusId, sonnetId] = [id('Opus'), id('Sonnet')]
  const brief = ['Role: Character TD · Kit: references · Size: M', 'Item: new', 'Plan: p.md', 'Acceptance: ok', 'Model: opus', 'Skills: blender-body', 'Done when: x', 'Stop when: 3', 'Start: read MEMORY.md first', 'Threads: none open on this topic'].join('\n')
  const out = decide('mcp__hearthbot__start_thread', { prompt: brief, model: opusId, title: 'Character TD · Lily' }, [], [], teams, checklists, []).block
  for (const part of [/Kit: references is no kit/, /Sheet:/, /Target image:/, /Source:/, /Prior art/, new RegExp(`runs on sonnet \\(${sonnetId}\\)`)]) assert.match(out, part)
  assert.doesNotMatch(out, /Gate:/, 'Gate is a recoverable gap the thread closes (#761)')
  // The same brief on a real kit lists the same gaps minus the kit: nothing new appears after the kit is fixed.
  const fixed = decide('mcp__hearthbot__start_thread', { prompt: brief.replace('references', 'game'), model: opusId, title: 'Character TD · Lily' }, [], [], teams, checklists, []).block
  for (const part of [/Sheet:/, /Target image:/, /Source:/, /Prior art/, new RegExp(`runs on sonnet \\(${sonnetId}\\)`)]) assert.match(fixed, part)
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
  for (const bad of ['At ~200k context post status and stop.', 'Stop at 30000 tokens.', 'hand off at 250k tokens', 'Post a status when 80% of context is used, then stop.', 'Übergabe bei 200k Tokens', 'ÜBERGABE bei 200k Kontext', 'Stopp bei 250k Tokens, dann Übergabe', 'Bei 80% Kontext übergeben', 'Hand over at 200K context', 'Wrap up and report when context reaches 200k', 'Stop when: context is at 70 %', '- stop at 0.2M tokens', 'Bei 200k Kontext Status posten und stoppen', 'Do not go past 200k tokens: stop and post status', 'Beende den Thread bei 200k Tokens', 'Übergib bei 200k Token an den nächsten Thread', 'Stop when: context usage reaches 80 %',
    'Stop before 200k tokens', '**Stop** at `200k` tokens and hand off', 'When the context is over 150k, hand off to a new thread', 'Stoppe, wenn der Kontext über 80 % ist', 'Pause at 90% context and post a status']) {
    const out = problems([bad]).join('\n')
    assert.match(out, /token count[\s\S]*role change, quality loss or a milestone/, `refused: ${bad}`)
  }
  for (const ok of ['Stop when: 3 gate rounds without 5/5, then report', 'Output: a 4k px render', 'Tools and sources: docs/WORKFLOW.md, Handoff triggers', 'Acceptance: the endpoint answers status 200 for 100k users', 'Acceptance: HTTP status 404 for an unknown id, 2k rows seeded',
    'Acceptance: bundle stays under 250k, status check green', 'Acceptance: the texture is 4k and the status bar shows the frame', 'Acceptance: the stop button shows after 2k ms; 1.5k stars, status badge green',
    'Done when: the page loads for 100k users without a stop; status is "merged" and the file is under 50k bytes', 'Stop when: the render needs more than 8k samples; stop and ask before spending 5k EUR',
    'Item: #587 the brief check refuses a stop at 200k tokens', 'Plan: never stop at a token count (the 250k rule is outdated)', 'Stop when: 2 failed attempts, then post the status; <rounds or attempts, never tokens>',
    'Context: PR #588 at 1d53c9b, round 1 report in the PR comment', 'Context: 3 PRs open, status in the board', 'Kontext: Runde 2, Bericht der Runde 1 liegt im PR', 'Objective: stop the regression where context 3 of 5 tabs loses state',
    'Acceptance: MEMORY.md stays under 2k tokens; report the count', 'Done when: the summary fits in 500 tokens and the PR status is green', 'Acceptance: rate limit of 100 tokens per minute, status 429 after that',
    'Acceptance: the model call sets max 1024 tokens and a stop sequence', 'Tools: docs/WORKFLOW.md Token budget (a gate thread starts at ~114k tokens), report in under 30 lines', 'Acceptance: the prompt stays under 8k tokens; report the measured size',
    'Context: the bundle is 250k today; pause the deploy', 'Context: bundle at 250k today; pause the deploy', 'Kontext: Build bei 300k, Deploy stoppen', 'Context: after 30000 rows the import was slow; stop the import job first',
    'Acceptance: the progress bar stops at 100 % full', 'Acceptance: the tank is at 80 % full, then pause the pump', 'Done when: disk at 90 % used raises the alert and the stop hook runs',
    'Acceptance: the stream stops after 30000 tokens (max_tokens)', 'Acceptance: generation stops at 4k tokens because max_tokens is set',
    'Acceptance: the check refuses "at ~200k context post status and stop"', 'Acceptance: a brief with `stop at 30000 tokens` is refused', 'Plan: the line „Übergabe bei 200k Tokens“ is refused by the check',
    'Acceptance: “hand off at 250k tokens” gets the refusal text; stop after 3 rounds', 'Acceptance: pause menu opens; context menu shows 12 items at 100 % zoom', 'Context: issue #587, stop words list is 14 entries, see PR at 2e4785f']) assert.doesNotMatch(problems([ok]).join('\n'), /token count/, `passes: ${ok}`)
})

// #616: a line written the way the template's own placeholder words it counts as filled.
test('#616: `Item: issue #610` gives no "lacks Item" note, and every template placeholder, filled as it is worded, is clean', async () => {
  const ok = Object.entries(LINES).filter(([k]) => k !== 'Item').map(([, l]) => l)
  const out = await check(['Role: Programmer · Kit: setup · Size: M', 'Research SOTA of the thing.', 'Item: issue #610', ...ok].join('\n'))
  assert.doesNotMatch(out, /lacks[^\n]*Item/, 'the template wording counts as filled')
  for (const f of BRIEF_FIELDS.filter((x) => x.clean)) {
    const placeholder = f.tpl.match(/<(.*)>/)[1] // e.g. `issue #n, M<n> or new`
    for (const alt of placeholder.replace(/<n>/g, '3').split(/,\s*|\s+or\s+/)) {
      const line = f.tpl.replace(/<.*>/, alt.replace(/#n/g, '#610'))
      assert.ok(f.clean(line), `${f.key}: "${line}" is clean`)
    }
    const fileLine = readFileSync(join(root, 'docs/templates/thread-brief.md'), 'utf8').split('\n').find((l) => l.startsWith(`${f.key}:`))
    assert.equal(fileLine, f.tpl, `${f.key}: the template file words the line as tpl does`)
  }
})

// #627, #689 (GameDev 2026-11-15, two-figure scene): plan v2 was built from cloud docs only and failed the gate. An Animator or Character TD brief names the asset's pre-gate file,
// which quotes the project's docs; a missing line is a repair the thread closes itself, and the Animator role file carries the stop rule for an offline laptop.
test('#689: an Animator or Character TD brief without a Pre-gate line is repaired, other roles are not asked, and the role files hold the rules', async () => {
  const builder = (role, extra = []) => [`Role: ${role} · Kit: game · Size: M`, ...Object.entries(LINES).filter(([k]) => k !== 'Pre-gate').map(([, l]) => l), ...extra].join('\n')
  for (const role of ['Animator', 'Character TD']) {
    assert.match(await check(builder(role)), /^Brief repair[^\n]*lacks[^\n]*Pre-gate[\s\S]*PREGATE\.md[\s\S]*laptop offline means stop and report/, `${role}: the thread is told to write the pre-gate file and to stop when the laptop is offline`)
    assert.doesNotMatch(await check(builder(role, [LINES['Pre-gate']])), /Pre-gate/, `${role}: with the line there is nothing to repair`)
    assert.match(await check(builder(role, ['Pre-gate:'])), /Pre-gate/, `${role}: an empty line is still a gap`)
    assert.match(await check(builder(role, [BRIEF_FIELDS.find((f) => f.key === 'Pre-gate').tpl])), /Pre-gate/, `${role}: the raw template placeholder is still a gap (gate round 1 of PR 688)`)
  }
  assert.doesNotMatch(await check(`Role: Programmer · Kit: setup · Size: M\n${Object.values(LINES).join('\n')}`.replace(/\nPre-gate:[^\n]*/, '')), /Pre-gate/, 'a Programmer brief is not asked for it')
  assert.ok(!BRIEF_FIELDS.some((f) => ['Scene docs', 'Proven recipe'].includes(f.key)), 'Scene docs and Proven recipe are one row now')
  const { briefFile } = await import('./brief.mjs')
  for (const role of ['Animator', 'Character TD']) assert.match(briefFile(role), /^Pre-gate:/m, `the ${role} brief file carries the line`)
  assert.doesNotMatch(briefFile('Programmer'), /^Pre-gate:/m)
  const role = readFileSync(join(root, '.claude/skills/operator/roles/animator.md'), 'utf8')
  for (const rule of [/Scene docs/, /old scenes/i, /offline[^\n]*stop and report/i, /one scene card/i, /Pre-gate file/]) assert.match(role, rule, `animator.md: ${rule}`)
  assert.doesNotMatch(role, /companyxy|SZENE-REZEPT/i, 'the role file stays generic, product paths live in the project CLAUDE.md')
})

// vacation-game 2026-11-15 (yskills): a level went to build with no teardown, no level plan, no design proposals. A level brief in the game kit
// names the files of the steps before its role (docs/TEAMS.md, A level); a start without them is refused, a non-level game brief is untouched.
test('a game level brief names research, plan and design up to its own step, or is refused', async () => {
  const { missingLines } = await import('../global/team-guard.mjs')
  const BASE = FULL_M.replace(/^Level:.*\n?/m, '')
  const lvl = (role, level = '', kit = 'game', task = 'Move the airport level to first person.') => missingLines([`Role: ${role} · Kit: ${kit} · Size: M`, task, level, BASE].join('\n')).filter((l) => l.startsWith('Level'))
  const R = 'research research/airport-level.md', P = 'plan plans/airport-PLAN.md', D = 'design design/airport-proposals.md'
  assert.equal(lvl('Programmer').length, 1, 'a builder without the line')
  assert.equal(lvl('Programmer', `Level: ${R} · ${P}`).length, 1, 'a builder without the design pick')
  assert.equal(lvl('Programmer', 'Level: research <page> · plan <file> · design <file>').length, 1, 'placeholders do not count')
  assert.deepEqual(lvl('Programmer', `Level: ${R} · ${P} · ${D}`), [])
  assert.equal(lvl('Game Designer', `Level: ${R}`).length, 1, 'the Game Designer needs the level plan')
  assert.deepEqual(lvl('Game Designer', `Level: ${R} · ${P}`), [])
  assert.deepEqual(lvl('Planner', `Level: ${R}`), [])
  assert.equal(lvl('Planner').length, 1, 'the Planner needs the Researcher page')
  assert.deepEqual(lvl('Programmer', 'Level: n/a bug fix, no play or look change'), [], 'a bug fix says why')
  assert.deepEqual(lvl('Programmer', 'Level: n/a'), lvl('Programmer'), 'a bare n/a is no reason')
  assert.deepEqual(lvl('Researcher'), [], 'the Researcher is the first step')
  assert.deepEqual(lvl('Programmer', '', 'setup'), [], 'only the game kit')
  assert.deepEqual(lvl('Programmer', '', 'setup', 'Fix the brief check for Kit: game threads.'), [], 'the kit is the stamp\'s, not a quoted one')
  for (const bad of ['research https://', 'research .md', 'research #cmsg']) assert.equal(lvl('Planner', `Level: ${bad}`).length, 1, `an ending alone is no file: ${bad}`)
  assert.deepEqual(lvl('Planner', `Level: the airport, first person\nLevel: ${R}`), [], 'a task line starting with Level: does not hide the real one')
  assert.deepEqual(lvl('Game Designer', 'Level: research [Airport research teardown](#cmsg_012GGqXBFiZN) · plan [Airport level plan](https://github.com/o/r/blob/main/PLAN.md)'), [], 'a thread link titled with spaces counts')
  assert.equal(lvl('Planner', 'Level: research [Airport research](later)').length, 1, 'a titled link still needs a file or a link inside')
  assert.equal(lvl('Planner', 'Level: research [Airport research](https://)').length, 1, 'the closing bracket is no host')
  assert.deepEqual(lvl('Game Designer', 'Level: research [Researcher · airport teardown](#cmsg_012GGqXBFiZN) · plan [Planner · airport roadmap](#cmsg_012GGqXBFiZM)'), [], 'a · inside a link title does not split the line')
  for (const task of ['Move the airport to first person.', 'Build the night market in 3D.', 'Build market scene in 3D: the 70 m hero block of Hang Ma.', 'Fix the save menu.'])
    assert.equal(lvl('Programmer', '', 'game', task).length, 1, `every game-kit builder brief carries the line: ${task}`)
  for (const bad of ['research x · plan x · design x', 'research TBD · plan TBD · design TBD', 'research none · plan none · design none'])
    assert.equal(lvl('Programmer', `Level: ${bad}`).length, 1, `no file, no pass: ${bad}`)
  assert.equal(lvl('Game Designer', 'Level: research the plan is not written yet').length, 1, 'a word inside a sentence is no file')
  assert.deepEqual(lvl('Game Designer', 'Level: research https://x.y/r · plan #cmsg_012abc'), [], 'links count')
  const { BRIEF_FIELDS: F } = await import('../global/team-guard.mjs')
  const ok = F.find((f) => f.key === 'Level').ok
  assert.equal(ok('Scope: the lamp.'), false, 'an item body without the line fills nothing')
  assert.equal(ok(`Level: ${R} · ${P}`), false, 'an item body without a role needs all three')
  assert.equal(ok(`Level: ${R} · ${P} · ${D}`), true)
  const refused = await check([`Role: Programmer · Kit: game · Size: M`, 'Build the airport level.', BASE].join('\n'))
  assert.match(refused, /^Brief check[\s\S]*Level/, 'the start is refused with the Level line named')
  assert.doesNotMatch(await check([`Role: Programmer · Kit: game · Size: M`, 'Build the airport level.', `Level: ${R} · ${P} · ${D}`, BASE].join('\n')), /^Brief check/)
  assert.match(readFileSync(join(root, 'docs/TEAMS.md'), 'utf8'), /\| `game` \|[^\n]*\| Researcher, Planner, Game Designer/, 'the game kit lists the order')
})

test('GameDev 2026-11-15, #689: the Character TD role files and the gate text carry the pre-gate rules and stay generic', async () => {
  const role = readFileSync(join(root, '.claude/skills/operator/roles/character-td.md'), 'utf8')
  for (const rule of [/proven list/, /Self-loop/, /4\.8 or more/, /front, back, left, right/, /Pre-gate file/, /^## Co-founder$/m]) assert.match(role, rule, `character-td.md: ${rule}`)
  for (const f of ['global/team-guard.mjs', 'docs/templates/thread-brief.md', '.claude/skills/operator/roles/character-td.md', '.claude/skills/garment-fit/SKILL.md', 'docs/clothing-pipeline.md', '.claude/skills/operator/gate.md']) {
    const t = readFileSync(join(root, f), 'utf8')
    assert.doesNotMatch(t.split('\n').filter((l) => /Pre-gate|proven route|proven list/i.test(l)).join('\n'), /PROVEN\.md|outfit\.py|bikini|Yumeka/i, `${f}: the rule stays generic, product paths live in the project's CLAUDE.md`)
  }
  assert.match(readFileSync(join(root, '.claude/skills/garment-fit/SKILL.md'), 'utf8'), /Self-loop[\s\S]*4\.8/)
  const dir = join(root, '.claude/skills/operator')
  const gate = readFileSync(join(dir, 'gate.md'), 'utf8')
  assert.match(gate, /Before a builder asks for a gate[\s\S]*\*\*Recipe\.\*\*[\s\S]*\*\*Pitfalls\.\*\*[\s\S]*\*\*Before the build gate\.\*\*/)
  assert.match(gate.match(/Before a builder asks for a gate[\s\S]*?\n## /)[0], /\[guard: hook global\/rule-guard\.mjs\]/, 'the hook enforces the step (#689)')
  for (const r of ['character-td', 'animator']) assert.match(readFileSync(join(dir, 'roles', `${r}.md`), 'utf8'), /\*\*Pre-gate file\.\*\*[^\n]*pitfall rows[^\n]*Tick it before the build gate/i, r)
  assert.doesNotMatch(readFileSync(join(dir, 'roles', 'programmer.md'), 'utf8'), /Past errors before the gate|Pre-gate file/, 'a code PR keeps ship-check (rule text section 5)')
})

// GameDev 2026-11-15 (#697, #702): a builder guessed a chosen look because the brief named neither target nor source. The brief row Look-Lock is gone.
test('#702: Target image and Source are judgment gaps for Programmer, Animator and Character TD on game and story with a real Sheet, and for no one else', async () => {
  const { classify, missingLines } = await import('../global/team-guard.mjs')
  const gaps = (brief) => classify(brief).judgment.map((f) => f.key).filter((k) => ['Target image', 'Source'].includes(k))
  for (const role of ['Programmer', 'Animator', 'Character TD']) for (const kit of ['game', 'story']) {
    assert.deepEqual(gaps(`Role: ${role} · Kit: ${kit} · Size: M\nSheet: sheet.md`), ['Target image', 'Source'], `${role} on ${kit}`)
    assert.deepEqual(gaps(`Role: ${role} · Kit: ${kit} · Size: M\nSheet: n/a a rig check, no body, face or outfit job`), [], `${role} on ${kit} with Sheet: n/a is not asked`)
    assert.deepEqual(gaps(`Role: ${role} · Kit: ${kit} · Size: M\nSheet: sheet.md\n${LINES['Target image']}\n${LINES.Source}`), [])
    assert.deepEqual(gaps(`Role: ${role} · Kit: ${kit} · Size: M\nSheet: sheet.md\n${LINES['Target image']}`), ['Source'], 'a target without its source is refused')
    assert.deepEqual(gaps(`Role: ${role} · Kit: ${kit} · Size: M\nSheet: sheet.md\nTarget image: [the pick](lib/characters/CH_x/approval/A.png)\nSource: [the files](https://example.com/files)`), [], 'titled Markdown links pass')
    assert.deepEqual(gaps(`Role: ${role} · Kit: ${kit} · Size: M\nSheet: sheet.md\nTarget image: n/a\n${LINES.Source}`), ['Target image'], 'a bare n/a fails')
    assert.deepEqual(gaps(`Role: ${role} · Kit: ${kit} · Size: M\nSheet: sheet.md\nTarget image: lib\\characters\\CH_x\\approval\\A.png\nSource: lib\\characters\\CH_x\\work`), [], 'laptop paths with backslashes pass')
  }
  assert.deepEqual(gaps('Role: Programmer · Kit: setup · Size: M\nSheet: sheet.md'), [], 'kit setup is not asked')
  for (const role of ['Designer', 'Planner', 'Reviewer']) assert.deepEqual(gaps(`Role: ${role} · Kit: game · Size: M`), [], `${role} is not asked`)
  // n/a: a Programmer may say why there is no target, and that drops Source; a visual role has no n/a.
  const na = 'Target image: n/a this slice changes no look at all'
  assert.deepEqual(gaps(`Role: Programmer · Kit: game · Size: M\nSheet: sheet.md\n${na}`), [], 'Programmer: n/a <why> passes and Source is not asked')
  assert.deepEqual(gaps('Role: Programmer · Kit: game · Size: M\nSheet: sheet.md\nTarget image: n/a no'), ['Target image', 'Source'], 'a short reason is none')
  for (const role of ['Animator', 'Character TD']) assert.deepEqual(gaps(`Role: ${role} · Kit: game · Size: M\nSheet: sheet.md\n${na}\n${LINES.Source}`), ['Target image'], `${role} has no n/a`)
  // Gate fix 1 (PR 709 round 1): `Source: n/a <why>` is no source for any role, the `/` in `n/a` must not satisfy the path test.
  for (const role of ['Programmer', 'Animator', 'Character TD']) assert.deepEqual(gaps(`Role: ${role} · Kit: game · Size: M\nSheet: sheet.md\n${LINES['Target image']}\nSource: n/a there are no source files`), ['Source'], `${role}: Source n/a is refused`)
  // The path: an approval/ folder (reference/ for motion) and an image, PDF or clip; nothing else is a target.
  const row = BRIEF_FIELDS.find((f) => f.key === 'Target image')
  for (const good of ['lib/characters/CH_x/approval/A.png', 'scenes/S_x/reference/walk.mp4', 'approval/A.webp', 'lib/characters/CH_x/approval/A.jpg', 'lib/x/approval/A.png, pick A', 'lib/x/approval/A.png.', 'lib/x/approval/A.png; pick A']) assert.ok(row.ok(`Target image: ${good}`), good)
  for (const bad of ['later', 'lib/characters/CH_x/A.png', 'lib/characters/CH_x/approval/', 'lib/characters/CH_x/approval/notes.md', 'https://x.y/card', '<path in approval/A.png>', 'lib/x/disapproval/A.png']) assert.equal(row.ok(`Target image: ${bad}`), false, bad)
  assert.equal(BRIEF_FIELDS.some((f) => f.key === 'Look-Lock'), false, 'the brief row Look-Lock is gone')
  // Gate fix 3: with no picture locked yet the refusal says what to do, and names reference/ for motion.
  assert.match(missingLines('Role: Animator · Kit: story · Size: M').join('\n'), /Target image:[^\n]*lock the pick first or ask the owner one line/, 'the refusal says what to do when nothing is locked')
  assert.ok(missingLines('Role: Animator · Kit: story · Size: M').some((l) => l.startsWith('Target image:')) && missingLines('Role: Animator · Kit: story · Size: M').some((l) => l.startsWith('Source:')), 'the coordinator-side refusal names both')
})

test('#702: an otherwise complete old brief that still carries a Look-Lock line starts, on both sides', async () => {
  const { decide } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const { modelFor } = await import('./brief.mjs')
  const old = `Role: Programmer · Kit: game · Size: M\n${FULL_M}\nLook-Lock: owner card https://claude.ai/c/1`.replace('Model: sonnet', `Model: ${modelFor('Programmer', 'M')}`)
  assert.deepEqual(decide('mcp__hearthbot__start_thread', { brief: old, title: 'Programmer · x', model: modelFor('Programmer', 'M') }, [], [], teams), {})
  assert.doesNotMatch(await check(old), /^Brief check/)
  // The same brief without the two new lines is refused: the old line does not stand in for them.
  assert.match(decide('mcp__hearthbot__start_thread', { brief: old.replace(/^(Target image|Source):.*\n/gm, ''), title: 'Programmer · x', model: modelFor('Programmer', 'M') }, [], [], teams).block ?? '', /Target image:[\s\S]*Source:/)
})

test('#702: the template files carry Target image and Source and no Look-Lock line', async () => {
  const { briefFile } = await import('./brief.mjs')
  const template = readFileSync(join(root, 'docs/templates/thread-brief.md'), 'utf8')
  for (const [name, text] of [['thread-brief.md', template], ...['Programmer', 'Animator', 'Character TD'].map((r) => [r, briefFile(r)])]) {
    assert.match(text, /^Sheet: .*\nTarget image: <.*\nSource: </m, `${name}: both lines after Sheet`)
    assert.doesNotMatch(text, /Look-Lock/, name)
  }
  for (const role of ['Designer', 'Planner', 'Reviewer']) assert.doesNotMatch(briefFile(role), /^(Target image|Source):/m, `${role} is not asked`)
  assert.doesNotMatch(readFileSync(join(root, '.github/ISSUE_TEMPLATE/plan.md'), 'utf8'), /Look-Lock/)
  for (const f of ['docs/character-workflow.md', '.claude/skills/operator/roles/project-manager.md', '.claude/skills/operator/briefs.md']) assert.doesNotMatch(readFileSync(join(root, f), 'utf8'), /Look-Lock/, `${f} names no Look-Lock brief line`)
  assert.match(readFileSync(join(root, 'docs/character-workflow.md'), 'utf8'), /`Target image:` and `Source:`/)
})

// #729 (a): an Item line with text but no token is repaired to `Item: new`, never refused; a placeholder and the `PLAN.json item <n>` shape keep their refusal.
test('Item free text: repaired to `Item: new` and counted repaired; PLAN.json item 29 and the placeholder stay faults', async () => {
  const withItem = (item) => `Role: Programmer · Kit: setup · Size: M\n${FULL_M.replace('Item: M50', item)}`
  const free = await check(withItem('Item: Setup vs SOTA audit + role test via real game build'))
  assert.doesNotMatch(free, /^Brief check/, 'not refused')
  assert.match(free, /^Brief fill:[^\n]*Item: new/m, 'the thread sees `Item: new`')
  const { startOutcome } = await import('../global/card-render.mjs')
  assert.equal(startOutcome(free).outcome, 'clean', 'a self-filled Item is a fill, not a repair (#780)')
  assert.deepEqual(startOutcome(free).reasons, [])
  const plan = await check(withItem('Item: PLAN.json item 29'))
  assert.match(plan, /^Brief check[\s\S]*Item is there but not in the asked form[\s\S]*Item: <issue #n, M<n> or new>/, 'it names the form')
  assert.match(await check(withItem('Item: <issue #n, M<n> or new>')), /^Brief check[\s\S]*Item is missing/, 'the placeholder is still refused at size M')
  for (const half of ['Item: 729', 'Item: issue 729', 'Item: PR 744', 'Item: PLAN.json 29', 'Item: Milestone 29', 'Item: m 29']) assert.match(await check(withItem(half)), /^Brief check[\s\S]*Item is there but not in the asked form/, `${half}: a reference with its sign missing is a fault, never new`)
  assert.match(await check(withItem('Item: M50')), /^(?!Brief)/, 'a real token is untouched')
})
// #729 (d): `n/a` is accepted for the whole Level line only; the refusal says so.
test('Level: n/a per segment is refused with a message that names the whole-line rule; the whole-line n/a and real files pass', async () => {
  const lvl = (l) => `Role: Game Designer · Kit: game · Size: M\n${Object.entries(LINES).filter(([k]) => k !== 'Level').map(([, x]) => x).join('\n')}\n${l}`
  const refused = await check(lvl('Level: research n/a (plan covers scope, role test not launch) · plan plans/kofferlauf.md'))
  assert.match(refused, /^Brief check[\s\S]*Level is there but not in the asked form[\s\S]*n\/a only as the whole line/)
  assert.doesNotMatch(await check(lvl('Level: n/a role test of a one-room game, no new or reworked level')), /^Brief check[^\n]*Level/)
  assert.doesNotMatch(await check(lvl('Level: research research/a.md · plan plans/b.md')), /^Brief check[^\n]*Level/)
})
