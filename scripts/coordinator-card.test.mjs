import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBrief } from './brief.mjs'
import { buildIndex, buildCard, ruleRows, CARD_MAX } from './coordinator-card.mjs'
import { BRIEF_FIELDS, kitNames, rosterNames } from '../global/team-guard.mjs'
import { compact, projectFolder, renderAll, renderBrief, renderRoster, writeAll } from '../global/card-render.mjs'

test('the card builds, stays under CARD_MAX characters and has its parts', () => {
  const card = buildCard({ hash: 'abc1234', date: '2026-11-08' })
  assert.ok(card.length < CARD_MAX, String(card.length))
  assert.match(card, /^Coordinator card \(claude-setup abc1234, 2026-11-08\)/)
  for (const s of ['Before every reply', 'Thread brief', 'Models', 'Roster', 'Kits', 'COORDINATOR-RULES-INDEX.md', '3 failed rounds on one asset', '4-6 Fable director']) assert.ok(card.includes(s), s)
})

test('the pre-flight carries the masterplan duty (roles/project-manager.md, Masterplan)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  const pre = card.split('## Thread brief')[0]
  for (const s of ['ISSUES.md', 'Item: new', 'Stand', 'write_custom_view']) assert.ok(pre.includes(s), s)
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

test('#604: the card names the three-part first-reply header, plan and board numbers included', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  assert.ok(card.includes('`Luna · card <hash> · plan <done>/<all> · board <n> open`'), 'the header')
  assert.match(card, /First reply: [^\n]*plan: the Plan count line of ISSUES\.md, or x\/y of plan\.mjs stand; board: threads of list_threads that are working, blocked or review_ready/, 'what the two numbers count')
  assert.match(readFileSync(join(import.meta.dirname, '..', '.claude/skills/operator/roles/project-manager.md'), 'utf8'), /Session start[\s\S]*first reply of the session opens `Luna · card <hash> · plan <done>\/<all> · board <n> open`/, 'Session start names the header')
})

test('#601: the card names root-check.mjs for "root clean", and the Archivist\'s cleanup ends with the four lines', () => {
  assert.match(buildCard({ hash: 'x', date: 'd' }), /"root clean": quote root-check\.mjs OK/)
  const role = readFileSync(join(import.meta.dirname, '..', '.claude/skills/operator/roles/archivist.md'), 'utf8')
  for (const s of ['<claude-setup checkout>/scripts/root-check.mjs <project-files root>', 'root-check not run: no checkout', 'every file has its folder', 'a move table: old path, new path', 'no doc still names an old path', 'OK line quoted', 'five for a laptop cleanup', '<claude-setup checkout>/scripts/approve.mjs check --all <studio root>', '`OK approval:` line', 'approval not run: laptop offline']) assert.ok(role.includes(s), s)
})

test('the first rule is the one loop (yskills 2026-11-12): role, playbook, Researcher gap, learnings back; its hooks behave', async () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  const first = card.split('## Before every reply\n\n')[1].split('\n')[0]
  for (const s of ['every thread has a role', 'Role: none', 'playbook, skills and workflows', 'Researcher finds', 'back to claude-setup', 'start receipt', 'starts a thread that locks itself', 'card #<hash>', 'Read this card again']) assert.ok(first.includes(s), s)
  const { stamped } = await import('../global/team-guard.mjs')
  assert.equal(stamped('Role: Programmer · Kit: setup · Size: S'), true)
  assert.equal(stamped('Role: none · Kit: setup · Size: S'), true, 'a mini or unclear task may name no role')
  assert.equal(stamped('Kit: setup · Size: S'), false, 'a brief without a Role line is refused')
  assert.match(readFileSync(new URL('../global/rule-guard.mjs', import.meta.url), 'utf8'), /export function threadReceipt\(role, brief/)
})

// S1 of the spec-to-review plan, corrected in S7: a bad Role, Kit or Size locks the thread, so the card must not tell the chat to check by hand,
// and the index carries one ready Role/Kit/Model/Skills line per Roster role (the chat has no Bash to run scripts/brief.mjs).
test('the card says a bad Role, Kit or Size locks the thread; the index lists every Roster role with its kits, model and playbook', () => {
  const card = buildCard({ hash: 'x', date: '2026-11-12' })
  assert.match(card, /a brief with no Role line, an unknown role or an unknown kit starts a thread that locks itself/)
  assert.doesNotMatch(card, /team-guard refuses a brief with no Role line/)
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
import { logStart, noteRelay, startOutcome, statsLine, isRealSession, startsWeek } from '../global/card-render.mjs'
// A real session id is a UUID (B3 #730): the log writes and counts only those, so a probe or a hand-run hook never reaches the number.
const sid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const fileOf = (n, date) => `${date}-${sid(n).replace(/-/g, '')}.json`
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

test('#712 G1.3: startOutcome cuts the found part, so a logged reason is one fixed text per field', () => {
  const plain = 'Brief check (docs/TEAMS.md): this start breaks the team rules in 1 place: (1) Level is there but not in the asked form. Do no work: send ALL of this to the coordinator'
  const withFound = 'Brief check (docs/TEAMS.md): this start breaks the team rules in 1 place: (1) Level is there but not in the asked form (found "Level: research r.md"; asked: Level: research <page> · plan <file> (x)). Do no work: send ALL of this to the coordinator\nLevel: research <page>\n3 of this role\'s template lines are missing: this brief was not copied from briefs/programmer.md.'
  assert.deepEqual(startOutcome(withFound), startOutcome(plain))
  assert.deepEqual(startOutcome(withFound), { outcome: 'refused', reasons: ['Level is there but not in the asked form'] })
})

test('one count line per start type: --stats over a folder with every outcome', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  const t = new Date('2026-11-12T10:00:00Z')
  const starts = [[sid(1), REFUSED], [sid(2), ''], [sid(3), ''], [sid(4), REPAIRED], [sid(5), WRONG]]
  for (const [session, check] of starts) logStart({ session, project: 'P', role: 'Programmer', kit: 'setup', size: 'S', guard: 'abcd1234', card: 'b6a9c717', ...startOutcome(check) }, out, t)
  assert.equal(readdirSync(join(out, 'brief-log')).length, 5, 'one file per start')
  assert.equal(statsLine(out), 'starts 5: clean 2, repaired 1, refused 1, wrong-model 1, duplicate 0 (false starts 2, 40%); top reason: Item is missing or still a <placeholder> (1x)')
  assert.equal(statsLine(out, new Date('2026-11-13T00:00:00Z')).startsWith('starts 0:'), true, 'since drops older starts')
  const file = JSON.parse(readFileSync(join(out, 'brief-log', fileOf(1, '2026-11-12')), 'utf8'))
  assert.deepEqual([file.project, file.role, file.kit, file.size, file.guard, file.card, file.outcome], ['P', 'Programmer', 'setup', 'S', 'abcd1234', 'b6a9c717', 'refused'])
  rmSync(out, { recursive: true, force: true })
})

test('a relay on a refused start lands in the same file; a clean start is left alone; a second hook for one start writes once', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  logStart({ session: sid(11), ...startOutcome(REFUSED) }, out)
  logStart({ session: sid(11), outcome: 'clean' }, out)
  logStart({ session: sid(12), ...startOutcome('') }, out)
  assert.equal(noteRelay(sid(11), false, out), true)
  assert.equal(noteRelay(sid(11), true, out), true)
  assert.equal(noteRelay(sid(12), true, out), false)
  const [f] = readdirSync(join(out, 'brief-log')).filter((n) => n.endsWith(`-${sid(11).replace(/-/g, '')}.json`))
  const e = JSON.parse(readFileSync(join(out, 'brief-log', f), 'utf8'))
  assert.deepEqual([e.outcome, e.relays, e.lifted], ['refused', 2, true])
  rmSync(out, { recursive: true, force: true })
})

test('twenty processes logging at once lose no start, and no folder or session means no log and no crash', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  const code = (i) => `const { logStart } = await import(${JSON.stringify(join(process.cwd(), 'global/card-render.mjs'))}); logStart({ session: '00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}', outcome: 'repaired', reasons: ['Skills'] }, ${JSON.stringify(out)})`
  const kids = Array.from({ length: 20 }, (_, i) => spawnSync(process.execPath, ['--input-type=module', '-e', code(i)], { encoding: 'utf8' }))
  assert.ok(kids.every((k) => k.status === 0))
  assert.match(statsLine(out), /^starts 20: clean 0, repaired 20,/)
  assert.equal(logStart({ session: sid(13), outcome: 'clean' }, null), null)
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
    await countStart({ session: sid(21), brief: brief('Programmer'), checkNow: REFUSED, modelNote: '', guard: 'Guards in this session: deadbeef (7/7 installed).', card: 'Card refreshed cafe1234: x' })
    await countStart({ session: sid(22), brief: brief('Programmer'), checkNow: '', modelNote: '', guard: '', card: '' })
    const read1 = (s) => JSON.parse(readFileSync(join(out, 'claude-setup', 'brief-log', readdirSync(join(out, 'claude-setup', 'brief-log')).find((n) => n.endsWith(`-${sid(s).replace(/-/g, '')}.json`))), 'utf8'))
    assert.deepEqual([read1(21).outcome, read1(21).project, read1(21).role, read1(21).guard, read1(21).card], ['refused', 'Demo Project', 'Programmer', 'deadbeef', 'cafe1234'])
    assert.equal(read1(22).outcome, 'clean')
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
  assert.equal(logStart({ session: sid(31), outcome: 'clean' }, out), null)
  assert.deepEqual(readdirSync(target), [], 'nothing went through the link')
  assert.equal(noteRelay(sid(31), true, out), false)
  rmSync(out, { recursive: true, force: true }); rmSync(target, { recursive: true, force: true })
})

test('a test run never resolves the real project folder, only an explicit temp one', () => {
  const inTest = { NODE_TEST_CONTEXT: 'child-v8' }
  assert.equal(projectFolder(inTest), null, 'no env override under node --test: no folder, so no brief-log write')
  const tmp = mkdtempSync(join(tmpdir(), 'pf-'))
  try {
    assert.equal(projectFolder({ ...inTest, CLAUDE_SETUP_PROJECT_FILES: tmp }), join(tmp, 'claude-setup'), 'an explicit temp folder still works')
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

// #602 (GameDev 2026-11-14): the card tells the coordinator to run the brief check; the command works from the rendered folder alone, with no installed home.
test('#602: the brief check the card prints runs from the rendered folder with an empty home and passes a filled Planner brief', () => {
  const out = mkdtempSync(join(tmpdir(), 'card-602-'))
  writeAll(out, renderAll({ base: join(fileURLToPath(import.meta.url), '..', '..') }))
  assert.ok(existsSync(join(out, 'briefs', 'planner.md')), 'the Planner brief file is there')
  const card = readFileSync(join(out, 'COORDINATOR-CARD.md'), 'utf8')
  const line = card.match(/`(node tools\/brief-check\/team-guard\.mjs check <Role> <file\|->)`/)
  assert.ok(line, 'the card prints one command that works from this folder')
  const { brief } = buildBrief({ role: 'Planner', kit: 'setup', size: 'M', what: 'plan the card fix', item: 'new', plan: 'n/a, this is the plan', acceptance: 'the plan passes review', threads: 'list_threads checked, none open on this topic', priorArt: 'obra/superpowers -> adapt, because the skill exists', done: 'the plan file', stop: '3 rounds', skills: '.claude/skills/operator/roles/planner.md' })
  writeFileSync(join(out, 'filled.md'), brief)
  const r = spawnSync(line[1].replace('<Role>', 'Planner').replace('<file|->', 'filled.md'), { cwd: out, encoding: 'utf8', shell: true, env: { ...process.env, CLAUDE_SETUP_HOME: mkdtempSync(join(tmpdir(), 'empty-home-')) } })
  assert.match(r.stdout, /^ok: this brief passes the start check/m, `${r.stdout}${r.stderr}`)
  assert.doesNotMatch(card, /You have no Bash and no repo/, 'the card no longer contradicts its own brief-check line')
})

test('F1 #613: the card tells the compaction summary to carry the re-read order (the card itself is dropped by a compaction)', () => {
  const pre = buildCard({ hash: 'x', date: 'd' }).split('## Thread brief')[0]
  assert.match(pre, /A summary of this chat \(compaction\) starts with the line: "read COORDINATOR-CARD\.md again, reopen with the header"/)
})

test('#595: the card says no post per review round, only a PASS or an ask (advisory in the chat, a hook for threads)', () => {
  assert.match(buildCard({ hash: 'x', date: 'd' }), /no post per review round/)
})

// ---- B3 #730: the start log tells the truth.
test('#730: only a UUID session is written and counted; a probe, rolelock or dbg session is not, and old stray files do not count', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  assert.equal(isRealSession(sid(1)), true)
  for (const bad of ['rolelock14998x2', 'dbg2', 'revinj5', 'probeD18958x1794914785001', 'h1', '', undefined]) assert.equal(isRealSession(bad), false, String(bad))
  assert.equal(logStart({ session: 'rolelock14998x2', outcome: 'clean' }, out), null)
  assert.equal(logStart({ session: 'dbg2', outcome: 'clean' }, out), null)
  assert.equal(existsSync(join(out, 'brief-log')), false, 'a refused session writes no folder either')
  // the files already on disk: they are filtered when counted, never moved
  mkdirSync(join(out, 'brief-log'))
  const stray = JSON.stringify({ at: '2026-11-17T10:00:00Z', outcome: 'refused', reasons: ['x'] })
  for (const n of ['2026-11-17-rolelock14998x2.json', '2026-11-17-dbg2.json', '2026-11-13-0a27810483b65cb19043f586b308460d.json.bak']) writeFileSync(join(out, 'brief-log', n), stray)
  logStart({ session: sid(1), outcome: 'clean' }, out)
  assert.match(statsLine(out), /^starts 1: clean 1,/)
  assert.equal(readdirSync(join(out, 'brief-log')).length, 4, 'nothing was moved or deleted')
  rmSync(out, { recursive: true, force: true })
})

test('#730: a failing write reaches stderr as one line, and the start still goes on', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  writeFileSync(join(out, 'brief-log'), 'a file where the folder should be')
  const code = `const { logStart } = await import(${JSON.stringify(join(ROOT, 'global/card-render.mjs'))}); console.log(String(logStart({ session: ${JSON.stringify(sid(41))}, outcome: 'clean' }, ${JSON.stringify(out)})))`
  const kid = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.equal(kid.status, 0)
  assert.equal(kid.stdout.trim(), 'null')
  assert.match(kid.stderr.trim(), /^card-render: start log not written \(\w+\): .+/, kid.stderr)
  assert.equal(kid.stderr.trim().split('\n').length, 1, 'one line')
  rmSync(out, { recursive: true, force: true })
})

test('#730: the hook writes the count before the slow card refresh, so a hook killed at its 5 s timeout still leaves the start', () => { // #742: both now run in the deferred child, never awaited in the prompt path
  const src = readFileSync(join(ROOT, 'global/rule-guard.mjs'), 'utf8')
  const at = (needle) => src.indexOf(needle)
  const prompt = src.slice(at("if (mode === 'prompt') {"), at("if (mode === 'stop') {"))
  assert.doesNotMatch(prompt, /await [^\n]*(countStart|cardLine)/, 'the prompt path waits for neither')
  const step = src.slice(at('async function deferredStart'))
  assert.ok(step.indexOf('countStart(') > 0 && step.indexOf('cardLine(') > step.indexOf('countStart('), 'countStart runs before cardLine (the card refresh writes ~35 files to the mount)')
})

test('#730: the card carries the 7-day start line, rendered from the folder, and nothing else changes when there is no log', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  const now = new Date('2026-11-22T12:00:00Z')
  logStart({ session: sid(1), ...startOutcome('') }, out, new Date('2026-11-21T10:00:00Z'))
  logStart({ session: sid(2), ...startOutcome(REFUSED) }, out, new Date('2026-11-20T10:00:00Z'))
  logStart({ session: sid(3), ...startOutcome('') }, out, new Date('2026-11-10T10:00:00Z'))
  const line = startsWeek(out, now)
  assert.equal(line, 'Thread starts, last 7 days (as of 2026-11-22): 2, clean 1, repaired 0, refused 1, wrong-model 0 (false starts 50%).')
  assert.ok(line.length <= 130, String(line.length))
  const card = buildCard({ teams, hash: 'abc12345', date: '2026-11-22', startsLine: line })
  assert.ok(card.includes(line))
  assert.ok(card.length < CARD_MAX, `${card.length} < ${CARD_MAX}`)
  assert.equal(startsWeek(null, now), '', 'no folder, no line')
  assert.equal(buildCard({ teams, hash: 'abc12345', date: '2026-11-22' }).includes('Thread starts, last 7 days'), false)
  const files = renderAll({ base: ROOT, hash: 'abc12345', date: '2026-11-22', startsLine: line })
  assert.ok(files.get('COORDINATOR-CARD.md').includes(line))
  rmSync(out, { recursive: true, force: true })
})

test('#730: the CLI writes the 7-day line into the card it renders, from the brief-log beside it', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  logStart({ session: sid(1), ...startOutcome('') }, out)
  logStart({ session: sid(2), ...startOutcome(REFUSED) }, out)
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts/coordinator-card.mjs'), join(out, 'COORDINATOR-CARD.md')], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const card = readFileSync(join(out, 'COORDINATOR-CARD.md'), 'utf8')
  assert.match(card, /Thread starts, last 7 days \(as of \d{4}-\d{2}-\d{2}\): 2, clean 1, repaired 0, refused 1, wrong-model 0 \(false starts 50%\)\./)
  rmSync(out, { recursive: true, force: true })
})

test('#730: an upper-case UUID is a real session and its file is counted', () => {
  const out = mkdtempSync(join(tmpdir(), 'brief-log-'))
  const upper = sid(7).replace(/0000$/, 'ABCD').replace(/-4000-/, '-4A00-')
  assert.equal(isRealSession(upper), true)
  logStart({ session: upper, outcome: 'clean' }, out)
  assert.match(statsLine(out), /^starts 1:/)
  rmSync(out, { recursive: true, force: true })
})

// ---- #743: the card is cut by use; CARD_MAX stays 7,400 (raising it again is the pattern the audit names).
test('#743: the card with the 7-day line is at most 7,050 characters (the who-builds paragraph of TEAMS.md rides on the card, 2026-11-22), CARD_MAX is still 7,400, 350 stay free', () => {
  assert.equal(CARD_MAX, 7400)
  const line = 'Thread starts, last 7 days (as of 2026-11-22): 7, clean 0, repaired 6, refused 1, wrong-model 0 (false starts 14%).'
  const card = buildCard({ teams, hash: 'abc12345', date: '2026-11-22', startsLine: line })
  assert.ok(card.length <= 7050, String(card.length))
  assert.ok(CARD_MAX - card.length >= 350, `free: ${CARD_MAX - card.length}`)
})

test('#743: the kept lines stay (spawn, models, sizes, roster, brief copy) and the cut lines are gone', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  for (const kept of ['Copy briefs/<role>.md of this folder', 'Nothing else is added or written from memory', '## Models', 'A thread picks no Fable', '## Sizes', '- S:', '- M:', '- L:', '## Roster', '- Programmer:', '- Reviewer:', 'Controls and World life', 'no post per review round']) assert.ok(card.includes(kept), kept)
  for (const gone of ['Downloads/assets', "A gate round's brief has the Round, Asset and Picture card lines"]) assert.ok(!card.includes(gone), gone)
})

test('#743: Kits is one line of names, not nine clipped rows; the full team text stays in ROSTER.md', () => {
  const card = buildCard({ teams, hash: 'x', date: 'd' })
  const kits = card.split('## Kits')[1]
  for (const kit of kitNames(teams)) assert.ok(kits.includes(kit), kit)
  assert.doesNotMatch(kits, /…/, 'no clipped kit row')
  assert.ok(kits.split('\n').filter((l) => l.startsWith('- ')).length <= 1, 'one line')
  assert.match(kits, /ROSTER\.md/)
})

test('#743 (moved from #689): the card leaves a builder between plan gate and build gate alone, one post per gate verdict', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  assert.ok(card.includes('- A builder between plan gate and build gate is left alone: no relay, no resolve, no status post; one post per gate verdict.'))
  assert.ok(card.length < CARD_MAX - 350, String(card.length))
})

test('#743 gate round 1: the download rule left the card for the index, which carries it with its homes', () => {
  const idx = buildIndex({ hash: 'x', date: 'd' })
  assert.match(idx, /- A download or asset in the inbox goes to a Character TD thread[^\n]*asset-intake[^\n]*Archivist indexes after the gate → [^\n]*asset-intake\/SKILL\.md[^\n]*character-td\.md/)
})
