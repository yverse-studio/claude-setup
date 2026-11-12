import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { decide, rosterNames, kitNames } from '../global/team-guard.mjs'
import { buildBrief, BriefError, roleLines } from './brief.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
const SONNET = teams.match(/Sonnet \((claude-[\w.-]+)\)/)[1]
const START = 'mcp__hearthbot__start_thread'
const FULL = '\nModel: claude-x-1\nThreads: list_threads checked, none open on this topic\nPrior art: none, because a test brief\nSkills: x\nDone when: node --test passes\nStop when: two rounds\nStart: read MEMORY.md first, then CLAUDE.md'

// The gap #453 left: team-guard checked the kit but never the role name.
test('team-guard blocks a Role that is neither none nor a Roster name, and says which names exist', () => {
  const bad = decide(START, { brief: `Role: Architect · Kit: setup · Size: M${FULL}`, title: 'Architect · x', model: SONNET }, [], [], teams)
  assert.match(bad.block ?? '', /Role: Architect is no role in docs\/TEAMS\.md[\s\S]*Programmer/)
  const ok = (role) => decide(START, { brief: `Role: ${role} · Kit: setup · Size: S${FULL}`, title: 'x', model: SONNET }, [], [], teams)
  assert.deepEqual(ok('Programmer'), {}, 'a Roster role passes')
  assert.deepEqual(ok('none'), {}, 'Role: none (a mini task) passes')
  assert.match(decide(START, { brief: `Role: Programer · Kit: setup · Size: S${FULL}`, model: SONNET }, [], [], teams).block ?? '', /Programer is no role/, 'a typo is caught')
})

test('team-guard still blocks an unknown Kit (the half #453 had), so a brief with a bad Role or Kit never starts', () => {
  const bad = decide(START, { brief: `Role: Programmer · Kit: content · Size: M${FULL}`, title: 'Programmer · x', model: SONNET }, [], [], teams)
  assert.match(bad.block ?? '', /Kit: content is no kit[\s\S]*setup/)
})

test('a name that only starts with a Roster role is no role (Programmers, Programmer-X, Designerin)', () => {
  const run = (role) => decide(START, { brief: `Role: ${role} · Kit: setup · Size: S${FULL}`, title: 'x', model: SONNET }, [], [], teams)
  for (const bad of ['Programmers', 'Programmer-X', 'ProgrammerFoo', 'Programmer/Hacker']) assert.match(run(bad).block ?? '', /is no role/, bad)
  for (const good of ['Programmer', 'programmer', 'PROGRAMMER', 'Programmer (setup)']) assert.deepEqual(run(good), {}, good)
})

test('every Roster table row is parsed by rosterNames, so a new role cannot drop out silently', () => {
  const roster = teams.slice(teams.indexOf('\n## Roster'), teams.indexOf('\n## Kits'))
  const rows = roster.split('\n').filter((l) => /^\| [^|]*\(\[`[^|]*\.md`\]/.test(l))
  assert.equal(rosterNames(teams).length, rows.length, 'every row with a playbook link is a role name')
})

test('rosterNames and kitNames read docs/TEAMS.md, no list of their own', () => {
  assert.ok(rosterNames(teams).includes('Programmer') && rosterNames(teams).includes('Social Lead'))
  assert.ok(kitNames(teams).includes('setup') && kitNames(teams).includes('story'))
  assert.deepEqual(rosterNames(''), [])
})

const FIELDS = { item: 'M1', threads: 'list_threads checked, none open on this topic', priorArt: 'claude-setup checked -> adapt, because it exists', done: 'node --test passes', stop: 'two rounds', what: 'x', start: 'CLAUDE.md', sheet: 'n/a no body, face or outfit job' }

// The property the owner asked for: a generated brief always passes the guard. Every Roster role x kit x size either
// yields a brief decide() lets through, or the generator refuses it with the same reason badTeam gives; none is silently wrong.
test('for every Roster role x kit x size the generated brief passes team-guard, or the generator refuses with the guard\'s reason', () => {
  let built = 0
  let refused = 0
  for (const role of rosterNames(teams)) for (const kit of kitNames(teams)) for (const size of ['S', 'M', 'L']) {
    let out
    try { out = buildBrief({ role, kit, size, ...FIELDS, tester: 'Tester · x', researcher: 'Researcher, sonnet', teams }) } catch (e) {
      assert.ok(e instanceof BriefError, `${role}/${kit}/${size}: ${e.message}`)
      // The backstop (decide() after building) is not a reason: a refusal there means the generator built what the guard refuses.
      assert.doesNotMatch(e.message, /fails team-guard/, `${role}/${kit}/${size} built a brief the guard refuses: ${e.message}`)
      refused++
      continue
    }
    built++
    const got = decide(START, { brief: out.brief, title: out.title, model: out.model }, [], [], teams)
    assert.deepEqual(got, {}, `${role}/${kit}/${size} refused by team-guard: ${got.block}\n${out.brief}`)
  }
  assert.ok(built > 40 && refused > 20, `built ${built}, refused ${refused}`)
})

test('the lines the guard demands are built or asked for, never dropped: Sheet, Look-Lock, Tester', () => {
  const { sheet, ...noSheet } = FIELDS
  const need = (f, re) => assert.throws(() => buildBrief({ teams, role: 'Programmer', kit: 'game', size: 'M', ...f }), (e) => e instanceof BriefError && re.test(e.message) && !/fails team-guard/.test(e.message))
  need(noSheet, /--sheet/)
  need({ ...FIELDS, sheet: 'docs/cast.md' }, /--look-lock/)
  need({ ...FIELDS, sheet: 'n/a' }, /10\+ characters|reason/)
  assert.throws(() => buildBrief({ teams, role: 'Programmer', kit: 'setup', size: 'L', ...FIELDS }), (e) => /--tester/.test(e.message))
  const full = buildBrief({ teams, role: 'Programmer', kit: 'game', size: 'M', ...FIELDS, sheet: 'docs/cast.md', lookLock: 'https://example.com/card/1' })
  assert.match(full.brief, /\nSheet: docs\/cast\.md\nLook-Lock: https:\/\/example\.com\/card\/1\n/)
  assert.deepEqual(decide(START, { brief: full.brief, title: full.title, model: full.model }, [], [], teams), {})
  assert.match(buildBrief({ teams, role: 'Programmer', kit: 'setup', size: 'L', ...FIELDS, tester: 'Tester · x' }).brief, /\nTester: Tester · x\n/)
})

test('a role row that names no model tier is refused, not defaulted; the index prints the raw cell', () => {
  assert.throws(() => buildBrief({ teams, role: 'Project Manager', kit: 'setup', size: 'M', ...FIELDS }), (e) => e instanceof BriefError && /Project Manager/.test(e.message) && /no model tier/.test(e.message))
  assert.match(roleLines(teams).find((l) => l.startsWith('Project Manager:')), /Model: as yskills sets it/)
})

test('the generator refuses an unknown role or kit and lists the valid ones; a missing field is named, never guessed', () => {
  assert.throws(() => buildBrief({ role: 'Modeller', kit: 'setup', size: 'S', ...FIELDS, teams }), (e) => e instanceof BriefError && /Modeller/.test(e.message) && /Programmer/.test(e.message))
  assert.throws(() => buildBrief({ role: 'Programmer', kit: 'content', size: 'S', ...FIELDS, teams }), (e) => e instanceof BriefError && /content/.test(e.message) && /setup/.test(e.message))
  assert.throws(() => buildBrief({ role: 'Programmer', kit: 'setup', size: 'S', teams }), (e) => e instanceof BriefError && /done/.test(e.message) && /prior-art/.test(e.message) && /threads/.test(e.message))
})

test('the brief carries the role\'s Model and playbook from the Roster, and the title of a size M thread', () => {
  const p = buildBrief({ role: 'Programmer', kit: 'setup', size: 'M', ...FIELDS, teams })
  assert.equal(p.model, teams.match(/Sonnet \((claude-[\w.-]+)\)/)[1], 'the id comes from the Models line')
  assert.match(p.brief, /^Role: Programmer · Kit: setup · Size: M\nModel: claude-[\w.-]+\n/)
  assert.match(p.brief, /Skills: .claude\/skills\/operator\/roles\/programmer\.md/)
  assert.match(p.title, /^Programmer · /)
})

test('roleLines gives one line per Roster role with its kits and model, for the coordinator index', () => {
  const lines = roleLines(teams)
  assert.ok(lines.length >= 15)
  assert.match(lines.find((l) => l.startsWith('Programmer:')), /Kit: .*setup.*Model: sonnet/)
})

test('roleLines tells subagent-only roles from thread roles by their Runs-as cell', () => {
  assert.match(roleLines(teams).find((l) => l.startsWith('Reviewer:')), /Runs as: subagent/)
})

test('the CLI never takes the next flag as a value, and names a bad --sheet', () => {
  const run = (...a) => spawnSync(process.execPath, [join(root, 'scripts/brief.mjs'), ...a], { encoding: 'utf8' })
  const r = run('--role', 'Programmer', '--kit', 'setup', '--size', 'S', '--item', '--threads', 'x')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /--item needs a value/)
})

test('the CLI exits non-zero with the valid list on a bad role, and prints a passing brief otherwise', () => {
  const run = (...a) => spawnSync(process.execPath, [join(root, 'scripts/brief.mjs'), ...a], { encoding: 'utf8' })
  const bad = run('--role', 'Architect', '--kit', 'setup', '--size', 'S')
  assert.notEqual(bad.status, 0)
  assert.match(bad.stderr, /Programmer/)
  const good = run('--role', 'Programmer', '--kit', 'setup', '--size', 'S', '--item', 'M1', '--threads', 'list_threads checked, none open on this topic', '--prior-art', 'x checked -> adapt, because y', '--done', 'tests pass', '--stop', 'two rounds', '--start', 'CLAUDE.md')
  assert.equal(good.status, 0, good.stderr)
  assert.match(good.stdout, /^Role: Programmer · Kit: setup · Size: S\n/)
})
