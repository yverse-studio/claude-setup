import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIndex, buildCard, ruleRows, CARD_MAX } from './coordinator-card.mjs'
import { BRIEF_FIELDS, rosterNames } from '../global/team-guard.mjs'
import { compact, renderAll, renderBrief, renderRoster, writeAll } from '../global/card-render.mjs'

test('the card builds, stays under CARD_MAX characters and has its parts', () => {
  const card = buildCard({ hash: 'abc1234', date: '2026-11-08' })
  assert.ok(card.length < CARD_MAX, String(card.length))
  assert.match(card, /^Coordinator card \(claude-setup abc1234, 2026-11-08\)/)
  for (const s of ['Before every reply', 'Thread brief', 'Models', 'Roster', 'Kits', 'COORDINATOR-RULES-INDEX.md', '3 failed rounds on one asset', '4-6 Fable director', 'Picture card']) assert.ok(card.includes(s), s)
})

test('the pre-flight carries the masterplan duty (roles/project-manager.md, Masterplan)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  const pre = card.split('## Thread brief')[0]
  for (const s of ['PLAN.json', 'plan.mjs', 'Stand', 'write_custom_view']) assert.ok(pre.includes(s), s)
})

test('the card carries a pointer to the rendered brief files, not a template, and the two refusal and device lines (M50 slice B)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  assert.ok(!card.includes('```'), 'no template block on the card: the brief files hold it')
  assert.doesNotMatch(card, /^Threads: <list_threads checked/m)
  for (const s of ['briefs/<role>.md', 'ROSTER.md', 'send those lines to the same thread with message_thread, never a new thread', '`message_id`', 'never `project_post_id` or `auto_attach=false`']) assert.ok(card.includes(s), s)
})

test('lines with a hook or no failure on record are off the card, the ones the hook-less chat must keep stay (M27 step 6)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  for (const gone of ['## Spawn rule', 'Escalation: stuck twice', '3 failed gate rounds', 'One home per rule']) assert.ok(!card.includes(gone), gone)
  for (const kept of ['second fresh thread for one asset', 'restart is not posted']) assert.ok(card.includes(kept), kept)
})

test('ruleRows reads the table', () => {
  assert.deepEqual(ruleRows('x\n## One home per rule\n\n| Rule | Home | Others |\n|---|---|---|\n| A | `a.md` | b |\n'), [{ rule: 'A', home: '`a.md`' }])
})

test('the rules index holds every row, unclipped, under 20,000 characters', () => {
  const idx = buildIndex({ hash: 'x', date: 'd' })
  assert.ok(idx.length < 20000, String(idx.length))
  assert.ok(idx.split('\n').filter((l) => l.startsWith('- ')).length >= 40)
  assert.match(idx, /^Rules index \(claude-setup x, d\)/)
})

test('the pre-flight carries the vacation-game fixes (facts, role check, dependencies, play before look)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  for (const s of ['only from a source read this turn', "same role and topic as the thread's title", 'Depends on: #n', 'real moment', 'Controls and World life']) assert.ok(card.includes(s), s)
})

test('a flag is never taken as the output path (#439: --help wrote a file named --help)', async () => {
  const { spawnSync } = await import('node:child_process')
  const { mkdtempSync, readdirSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(`${tmpdir()}/card-`)
  const r = spawnSync('node', [new URL('./coordinator-card.mjs', import.meta.url).pathname, '--help'], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.deepEqual(readdirSync(dir), [])
})

test('the first rule is the one loop (yskills 2026-11-12): role, playbook, Researcher gap, learnings back; its hooks behave', async () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  const first = card.split('## Before every reply\n\n')[1].split('\n')[0]
  for (const s of ['every thread has a role', 'Role: none', 'playbook, skills and workflows', 'Researcher finds', 'back to claude-setup', 'start receipt', 'unknown role or kit name', 'card #<hash>', 'Read this card again']) assert.ok(first.includes(s), s)
  const { stamped } = await import('../global/team-guard.mjs')
  assert.equal(stamped('Role: Programmer · Kit: setup · Size: S'), true)
  assert.equal(stamped('Role: none · Kit: setup · Size: S'), true, 'a mini or unclear task may name no role')
  assert.equal(stamped('Kit: setup · Size: S'), false, 'a brief without a Role line is refused')
  assert.match(readFileSync(new URL('../global/rule-guard.mjs', import.meta.url), 'utf8'), /export function threadReceipt\(role, brief/)
})

// S1 of the spec-to-review plan: team-guard refuses an unknown role or kit now, so the card must not tell the chat to check by hand,
// and the index carries one ready Role/Kit/Model/Skills line per Roster role (the chat has no Bash to run scripts/brief.mjs).
test('the card says team-guard refuses an unknown role or kit; the index lists every Roster role with its kits, model and playbook', () => {
  const card = buildCard({ hash: 'x', date: '2026-11-12' })
  assert.match(card, /team-guard refuses a brief with no Role line or an unknown role or kit name/)
  assert.doesNotMatch(card, /neither refuses an unknown role name/)
  const idx = buildIndex({ hash: 'x', date: '2026-11-12' })
  assert.match(idx, /- Programmer: Kit: [^\n]*setup[^\n]*; Model: sonnet; Runs as: [^\n]*; Skills: \.claude\/skills\/operator\/roles\/programmer\.md/)
  const teams = readFileSync(new URL('../docs/TEAMS.md', import.meta.url), 'utf8')
  for (const l of teams.split('\n').filter((x) => /^\| [A-Z][\w ]* \(\[`/.test(x))) assert.ok(idx.includes(`- ${l.slice(2, l.indexOf(' ('))}: Kit:`), l.slice(0, 30))
})

test('M30: the CLI writes one rendered brief file per role next to the card, and the index points at them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'card-'))
  const r = spawnSync(process.execPath, [new URL('./coordinator-card.mjs', import.meta.url).pathname, join(dir, 'COORDINATOR-CARD.md')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const files = readdirSync(join(dir, 'briefs'))
  assert.ok(files.includes('programmer.md') && files.includes('reviewer.md') && !files.includes('project-manager.md'), files.join(', '))
  assert.match(readFileSync(join(dir, 'briefs/programmer.md'), 'utf8'), /^# Brief file: Programmer[\s\S]*Model: claude-sonnet[\s\S]*Acceptance:/)
  assert.ok(existsSync(join(dir, 'COORDINATOR-RULES-INDEX.md')))
  assert.match(readFileSync(join(dir, 'COORDINATOR-RULES-INDEX.md'), 'utf8'), /briefs\/<role>\.md/)
})

const teams = readFileSync(new URL('../docs/TEAMS.md', import.meta.url), 'utf8')
const keyOf = (l) => l.match(/^([A-Z][\w -]*?):/)?.[1]
const EXTRA = ['Role', 'Round', 'Asset', 'Picture card', 'Topic']

// M50 slice B: card, ROSTER.md and every brief file are a function of BRIEF_FIELDS and docs/TEAMS.md; any drift fails here.
test('every brief file is BRIEF_FIELDS: no line outside the table, every row that holds for the role inside, a new row appears by itself', () => {
  const files = renderAll({ base: new URL('..', import.meta.url).pathname, hash: 'h', date: 'd' })
  const briefs = [...files].filter(([n]) => n.startsWith('briefs/'))
  assert.ok(briefs.length >= 30, `${briefs.length} brief files`)
  const keys = BRIEF_FIELDS.map((f) => f.key)
  for (const [name, text] of briefs) {
    const block = text.match(/```\n([\s\S]*?)```/)[1].split('\n').filter(Boolean)
    for (const l of block) assert.ok(keys.includes(keyOf(l)) || EXTRA.includes(keyOf(l)), `${name}: line "${keyOf(l)}" is a row of BRIEF_FIELDS`)
    for (const f of BRIEF_FIELDS.filter((r) => !r.applies && r.key !== 'Prior art')) assert.ok(block.some((l) => keyOf(l) === f.key), `${name}: row ${f.key}`)
    assert.match(text, /Objective:[\s\S]*Output:[\s\S]*Tools and sources:[\s\S]*Boundaries:/, `${name}: the four task parts`)
  }
  for (const role of ['Programmer', 'Animator']) assert.match(renderBrief(role, teams), /^Sheet: /m, `${role}: a conditional judgment row shows`)
  assert.match(renderBrief('Programmer', teams), /^Gate: .*before owner/m)
  assert.match(renderBrief('Reviewer', teams), /^Round: [\s\S]*^Picture card: /m)
  const extra = [...BRIEF_FIELDS, { key: 'Budget', tpl: 'Budget: <hours>', ok: () => true, cls: () => 'recoverable' }]
  assert.match(renderBrief('Programmer', teams, extra), /^Budget: <hours>$/m, 'a row added to the table is in the file with no other edit')
  assert.equal(renderBrief('Project Manager', teams), null)
  assert.match(renderBrief('Programmer', teams), /^Model: claude-[a-z0-9.-]+$/m, 'the model id is in the file')
})

test('ROSTER.md lists every Roster role and every kit with its thread roles and sizes; a card with an empty Roster or Kits section is refused', () => {
  const roster = renderRoster({ teams, hash: 'h', date: 'd' })
  for (const role of rosterNames(teams)) assert.ok(roster.includes(`**${role}**`), role)
  for (const kit of ['site', 'game', 'story', 'setup']) assert.match(roster, new RegExp(`### ${kit}\\n[\\s\\S]*Thread roles \\(sizes\\): .*Programmer \\(`))
  assert.doesNotMatch(roster, /…/, 'unclipped')
  assert.throws(() => compact('## Spawn rule\n\nModels: Opus (claude-x).\n\n## Sizes\n\n## Roster\n\n## Kits\n'), /no row/)
  assert.throws(() => buildCard({ teams: 'nothing here' }), /no Roster or Kits rows/)
})

test('a second run writes nothing, and a hand-edited or stale file is rewritten from the table', () => {
  const dir = mkdtempSync(join(tmpdir(), 'card-'))
  const base = new URL('..', import.meta.url).pathname
  const files = renderAll({ base, hash: 'h', date: 'd' })
  assert.equal(writeAll(dir, files), files.size)
  assert.equal(writeAll(dir, renderAll({ base, hash: 'h', date: 'd' })), 0, 'no diff on the second run')
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.new')), [], 'no temp file left')
  const real = mkdtempSync(join(tmpdir(), 'real-'))
  const linked = mkdtempSync(join(tmpdir(), 'link-'))
  symlinkSync(real, join(linked, 'briefs'))
  assert.throws(() => writeAll(linked, files), /symlink/)
  assert.deepEqual(readdirSync(real), [], 'nothing written through the link')
  writeFileSync(join(dir, 'briefs/programmer.md'), 'drifted by hand')
  assert.equal(writeAll(dir, files), 1)
  assert.match(readFileSync(join(dir, 'briefs/programmer.md'), 'utf8'), /^# Brief file: Programmer/)
})

// The boot copy: the guards flat in one folder with docs/, no checkout anywhere near (what ~/.claude/claude-setup is in a cloud thread).
function installedCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'installed-'))
  for (const f of readdirSync(new URL('../global', import.meta.url)).filter((x) => x.endsWith('.mjs'))) writeFileSync(join(dir, f), readFileSync(new URL(`../global/${f}`, import.meta.url)))
  mkdirSync(join(dir, 'docs'))
  for (const f of ['TEAMS.md', 'MAP.md']) writeFileSync(join(dir, 'docs', f), readFileSync(new URL(`../docs/${f}`, import.meta.url)))
  return dir
}
const refresh = (dir, out) => spawnSync(process.execPath, ['--input-type=module', '-e', `const { refreshCard } = await import(${JSON.stringify(`${dir}/card-render.mjs`)}); console.log(String(refreshCard(${JSON.stringify(dir)}, ${JSON.stringify(out)})))`], { encoding: 'utf8', cwd: tmpdir() })

test('M50 B acceptance: from an installed copy, no card and a stale card both end with every file at the installed hash, fast, and a current card is left alone', () => {
  const dir = installedCopy()
  const out = mkdtempSync(join(tmpdir(), 'proj-'))
  const t0 = Date.now()
  const first = refresh(dir, out)
  assert.equal(first.status, 0, first.stderr)
  const hash = first.stdout.trim()
  assert.match(hash, /^[0-9a-f]{8}$/, first.stdout)
  assert.ok(Date.now() - t0 < 2500, `${Date.now() - t0} ms`)
  for (const f of ['COORDINATOR-CARD.md', 'COORDINATOR-RULES-INDEX.md', 'ROSTER.md', 'briefs/programmer.md', 'briefs/reviewer.md']) assert.ok(existsSync(join(out, f)), f)
  assert.match(readFileSync(join(out, 'COORDINATOR-CARD.md'), 'utf8'), new RegExp(`^Coordinator card \\(claude-setup ${hash},`))
  assert.ok(readFileSync(join(out, 'COORDINATOR-CARD.md'), 'utf8').length < CARD_MAX)
  assert.equal(refresh(dir, out).stdout.trim(), 'null', 'a current card is not rewritten')
  writeFileSync(join(out, 'COORDINATOR-CARD.md'), 'Coordinator card (claude-setup 0a1b2c3d, 2026-11-01).\nold')
  assert.equal(refresh(dir, out).stdout.trim(), hash, 'a stale card is refreshed')
  assert.match(readFileSync(join(out, 'COORDINATOR-CARD.md'), 'utf8'), /Thread brief/)
  assert.equal(refresh(dir, join(dir, 'docs', 'no-such', 'x')).status, 0, 'an unwritable folder never fails the start')
  const none = refresh(dir, null)
  assert.equal(none.stdout.trim(), 'null', 'no project folder (a laptop session): nothing to refresh')
  writeFileSync(join(dir, 'docs', 'TEAMS.md'), readFileSync(join(dir, 'docs', 'TEAMS.md'), 'utf8').replace('## Kits', '## Kits\n\nChanged kit text.'))
  assert.notEqual(refresh(dir, out).stdout.trim(), 'null', 'a changed TEAMS.md makes the card stale')
})

test('the card is written last: a write that fails halfway leaves no card, so the next start repairs the folder', () => {
  const dir = installedCopy()
  const out = mkdtempSync(join(tmpdir(), 'proj-'))
  const real = mkdtempSync(join(tmpdir(), 'elsewhere-'))
  symlinkSync(real, join(out, 'briefs')) // a planted link makes the brief writes fail
  assert.equal(refresh(dir, out).stdout.trim(), 'null', 'the failed refresh reports nothing')
  assert.ok(!existsSync(join(out, 'COORDINATOR-CARD.md')), 'no card marks a half-written folder as current')
  assert.deepEqual(readdirSync(real), [], 'nothing went through the link')
  rmSync(join(out, 'briefs'))
  assert.match(refresh(dir, out).stdout.trim(), /^[0-9a-f]{8}$/, 'the next start writes everything')
  assert.ok(existsSync(join(out, 'briefs/programmer.md')))
})

test('ROSTER.md lists no role without a brief file as a thread role (the Project Manager)', () => {
  const roster = renderRoster({ teams, hash: 'h', date: 'd' })
  assert.match(roster, /\*\*Project Manager\*\*:[^\n]*no thread brief/)
  assert.doesNotMatch(roster.split('## Kits')[1], /Project Manager \(/)
  const briefs = [...renderAll({ base: new URL('..', import.meta.url).pathname, hash: 'h', date: 'd' }).keys()].filter((k) => k.startsWith('briefs/')).length
  assert.equal(briefs, rosterNames(teams).length - 1, 'one brief file per Roster role but the Project Manager')
})

// ---- M50 slice C: every thread start is counted (card-render.mjs: logStart, noteRelay, statsLine)
import { logStart, noteRelay, startOutcome, statsLine } from '../global/card-render.mjs'
const REFUSED = 'Brief check (docs/TEAMS.md): this start breaks the team rules in 2 places: (1) Item is missing or still a <placeholder> (2) Plan is missing or still a <placeholder>. Do no work: send ALL of this to the coordinator'
const REPAIRED = 'Brief repair (no block): the brief lacks Skills, Start. Work as if it read: x. Name the repaired lines in your first checklist line.'
const WRONG = 'Brief check (docs/TEAMS.md): this start breaks the team rules in 1 place: (1) this thread runs on sonnet, but the Planner runs on fable: ask the coordinator to restart it on that model. Do no work: send ALL'

test('startOutcome sorts a start into clean, repaired, refused or wrong-model, with its reasons', () => {
  assert.deepEqual(startOutcome(''), { outcome: 'clean', reasons: [] })
  assert.deepEqual(startOutcome(`${REPAIRED}\nTitle check (x)`), { outcome: 'repaired', reasons: ['Skills', 'Start'] })
  assert.deepEqual(startOutcome(REFUSED), { outcome: 'refused', reasons: ['Item is missing or still a <placeholder>', 'Plan is missing or still a <placeholder>'] })
  assert.equal(startOutcome(WRONG).outcome, 'wrong-model')
  assert.equal(startOutcome('', 'Model check (docs/TEAMS.md, Spawn rule 4): the brief asks for fable').outcome, 'wrong-model')
})

test('one count line per start type: --stats over a folder with every outcome', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  const t = new Date('2026-11-12T10:00:00Z')
  const starts = [['s1', REFUSED], ['s2', ''], ['s3', ''], ['s4', REPAIRED], ['s5', WRONG]]
  for (const [session, check] of starts) logStart({ session, project: 'P', role: 'Programmer', kit: 'setup', size: 'S', guard: 'abcd1234', card: 'b6a9c717', ...startOutcome(check) }, out, t)
  assert.equal(readdirSync(join(out, 'brief-log')).length, 5, 'one file per start')
  assert.equal(statsLine(out), 'starts 5: clean 2, repaired 1, refused 1, wrong-model 1, duplicate 0 (false starts 2, 40%); top reason: Item is missing or still a <placeholder> (1x)')
  assert.equal(statsLine(out, new Date('2026-11-13T00:00:00Z')).startsWith('starts 0:'), true, 'since drops older starts')
  const file = JSON.parse(readFileSync(join(out, 'brief-log', '2026-11-12-s1.json'), 'utf8'))
  assert.deepEqual([file.project, file.role, file.kit, file.size, file.guard, file.card, file.outcome], ['P', 'Programmer', 'setup', 'S', 'abcd1234', 'b6a9c717', 'refused'])
  rmSync(out, { recursive: true, force: true })
})

test('a relay on a refused start lands in the same file; a clean start is left alone; a second hook for one start writes once', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  logStart({ session: 'r1', ...startOutcome(REFUSED) }, out)
  logStart({ session: 'r1', outcome: 'clean' }, out)
  logStart({ session: 'c1', ...startOutcome('') }, out)
  assert.equal(noteRelay('r1', false, out), true)
  assert.equal(noteRelay('r1', true, out), true)
  assert.equal(noteRelay('c1', true, out), false)
  const [f] = readdirSync(join(out, 'brief-log')).filter((n) => n.endsWith('-r1.json'))
  const e = JSON.parse(readFileSync(join(out, 'brief-log', f), 'utf8'))
  assert.deepEqual([e.outcome, e.relays, e.lifted], ['refused', 2, true])
  rmSync(out, { recursive: true, force: true })
})

test('twenty processes logging at once lose no start, and no folder or session means no log and no crash', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  const code = (i) => `const { logStart } = await import(${JSON.stringify(join(process.cwd(), 'global/card-render.mjs'))}); logStart({ session: 'p${i}', outcome: 'repaired', reasons: ['Skills'] }, ${JSON.stringify(out)})`
  const kids = Array.from({ length: 20 }, (_, i) => spawnSync(process.execPath, ['--input-type=module', '-e', code(i)], { encoding: 'utf8' }))
  assert.ok(kids.every((k) => k.status === 0))
  assert.match(statsLine(out), /^starts 20: clean 0, repaired 20,/)
  assert.equal(logStart({ session: 'x', outcome: 'clean' }, null), null)
  assert.equal(logStart({ outcome: 'clean' }, out), null)
  assert.match(statsLine(null), /^starts 0:/)
  rmSync(out, { recursive: true, force: true })
})

test('the hook writes the count: a spawn prompt with a refused brief logs refused, a full one logs clean, both under the project name', async () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  const { countStart } = await import('../global/rule-guard.mjs')
  process.env.CLAUDE_SETUP_PROJECT_FILES = out
  try {
    const brief = (role) => `<wake reason="spawn"><project id="chan_1" name="Demo Project" type="project">Role: ${role} · Kit: setup · Size: S\n</project></wake>`
    await countStart({ session: 'h1', brief: brief('Programmer'), checkNow: REFUSED, modelNote: '', guard: 'Guards in this session: deadbeef (8/8 installed).', card: 'Card refreshed cafe1234: x' })
    await countStart({ session: 'h2', brief: brief('Programmer'), checkNow: '', modelNote: '', guard: '', card: '' })
    const read1 = (s) => JSON.parse(readFileSync(join(out, 'claude-setup', 'brief-log', readdirSync(join(out, 'claude-setup', 'brief-log')).find((n) => n.endsWith(`-${s}.json`))), 'utf8'))
    assert.deepEqual([read1('h1').outcome, read1('h1').project, read1('h1').role, read1('h1').guard, read1('h1').card], ['refused', 'Demo Project', 'Programmer', 'deadbeef', 'cafe1234'])
    assert.equal(read1('h2').outcome, 'clean')
  } finally { delete process.env.CLAUDE_SETUP_PROJECT_FILES; rmSync(out, { recursive: true, force: true }) }
})

// Gate round 1 of #501: the outcome is read from REAL briefCheck results, not from hand-written texts.
const ROOT = join(import.meta.dirname, '..')
const modelId = (tier) => readFileSync(join(ROOT, 'docs/TEAMS.md'), 'utf8').match(new RegExp(`${tier} \\((claude-[\\w.-]+)\\)`))[1]
const [SONNET_ID, FABLE_ID] = [modelId('Sonnet'), modelId('Fable')]
const spawned = (brief) => `<wake reason="spawn"><relay>${brief}</relay></wake>`
const BODY = '\nItem: M50\nPlan: p.md\nAcceptance: tests pass\nModel: x\nSkills: x\nDone when: tests pass\nStop when: 3 rounds\nStart: read MEMORY.md first\nThreads: list_threads checked, none open on this topic'
test('a real briefCheck result is sorted right: a Reviewer\'s gate.md note is repaired, a wrong model next to another gap is wrong-model', async () => {
  const { briefCheck } = await import('../global/rule-guard.mjs')
  const repaired = await briefCheck(spawned(`Role: Reviewer · Kit: setup · Size: S${BODY}\nPrior art: our notes -> adapt, because they exist`), ROOT, null)
  assert.match(repaired, /^Brief repair \(no block\)/)
  assert.equal(startOutcome(repaired).outcome, 'repaired', 'any Brief repair text is a repair')
  assert.equal(startOutcome(await briefCheck(spawned(`Role: Programmer · Kit: setup · Size: S${BODY}\nPrior art: obra/superpowers -> adapt, because it exists`), ROOT, null)).outcome, 'clean')
  const mixed = await briefCheck(spawned(`Role: Planner · Kit: setup · Size: M${BODY.replace('Item: M50\n', '')}\nPrior art: obra/superpowers -> adapt, because it exists`), ROOT, SONNET_ID)
  assert.match(mixed, /^Brief check[\s\S]*in 2 places[\s\S]*restart it on that model/, mixed)
  assert.equal(startOutcome(mixed).outcome, 'wrong-model', 'the restart text among the items decides')
  const plain = await briefCheck(spawned(`Role: Planner · Kit: setup · Size: M${BODY.replace('Item: M50\n', '')}\nPrior art: obra/superpowers -> adapt, because it exists`), ROOT, FABLE_ID)
  assert.equal(startOutcome(plain).outcome, 'refused')
})

test('a linked brief-log folder writes nothing and the start goes on', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  const target = mkdtempSync(join(tmpdir(), 'elsewhere-'))
  symlinkSync(target, join(out, 'brief-log'))
  assert.equal(logStart({ session: 'l1', outcome: 'clean' }, out), null)
  assert.deepEqual(readdirSync(target), [], 'nothing went through the link')
  assert.equal(noteRelay('l1', true, out), false)
  rmSync(out, { recursive: true, force: true }); rmSync(target, { recursive: true, force: true })
})
