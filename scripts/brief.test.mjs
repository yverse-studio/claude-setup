import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { decide, rosterNames, kitNames } from '../global/team-guard.mjs'
import { buildBrief, BriefError, roleLines } from './brief.mjs'
import { briefCheck } from '../global/rule-guard.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
const SONNET = teams.match(/Sonnet \((claude-[\w.-]+)\)/)[1]
const START = 'mcp__hearthbot__start_thread'
const FULL = '\nGate: Reviewer thread before owner\nItem: M30\nPlan: docs/plans/x.md\nAcceptance: node --test passes\nModel: claude-x-1\nThreads: list_threads checked, none open on this topic\nPrior art: none, because a test brief\nSkills: x\nDone when: node --test passes\nStop when: two rounds\nStart: read MEMORY.md first, then CLAUDE.md'

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

const FIELDS = { item: 'M1', plan: 'gate.md', acceptance: 'tests pass', threads: 'list_threads checked, none open on this topic', priorArt: 'yverse-studio/claude-setup checked -> adapt, because it exists', done: 'node --test passes', stop: 'two rounds', what: 'x', start: 'CLAUDE.md', sheet: 'n/a no body, face or outfit job' }

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
  const good = run('--role', 'Programmer', '--kit', 'setup', '--size', 'S', '--item', 'M1', '--plan', 'gate.md', '--acceptance', 'tests pass', '--threads', 'list_threads checked, none open on this topic', '--prior-art', 'scripts/brief.mjs checked -> adapt, because y', '--done', 'tests pass', '--stop', 'two rounds', '--start', 'CLAUDE.md')
  assert.equal(good.status, 0, good.stderr)
  assert.match(good.stdout, /^Role: Programmer · Kit: setup · Size: S\n/)
})

// CompanyXY 2026-11-12 (yskills' message 13:23, points 4 and 5): fresh Reviewer threads were blocked because their Prior art did not name
// gate.md and the kit checks, and gates were planned only after the owner complained. The generator writes both; the guard demands the second.
test('a generated gate-role brief names gate.md and the kit checks in Prior art by itself, and passes the thread-side gate check', async () => {
  const { priorArt, ...noPrior } = FIELDS
  const spawn = (b) => `<wake reason="spawn">\n${b}\n</wake>`
  for (const role of ['Reviewer', 'Tester', 'Security', 'Legal', 'Playtester']) {
    const kit = role === 'Playtester' ? 'game' : role === 'Legal' ? 'site' : 'setup'
    const out = buildBrief({ teams, role, kit, size: 'S', ...noPrior })
    assert.match(out.brief, new RegExp(`\\nPrior art: [^\\n]*\\bgate\\.md\\b[^\\n]*\\b${kit}\\b`), role)
    assert.equal(await briefCheck(spawn(out.brief), root), '', `${role}: the thread-side gate check passes`)
  }
  const own = buildBrief({ teams, role: 'Reviewer', kit: 'setup', size: 'S', ...FIELDS, priorArt: 'our review notes -> adapt, because they exist' })
  assert.match(own.brief, /Prior art: [^\n]*gate\.md[^\n]*our review notes/, 'a given Prior art keeps its words and gains gate.md')
  const handWritten = `Role: Reviewer · Kit: setup · Size: S${FULL}`
  assert.match(await briefCheck(spawn(handWritten), root), /^Brief repair \(no block\)[\s\S]*gate\.md/, 'the hand-written brief without gate.md blocked two Reviewer threads; now it is told to read gate.md')
})

test('a builder, designer or animator brief at size M or L needs `Gate: <reviewer thread> before owner`; gate roles and size S do not', () => {
  const ask = (role, kit, size, extra = '') => decide(START, { brief: `Role: ${role} · Kit: ${kit} · Size: ${size}${FULL.replace(/\nGate:[^\n]*/, '')}${extra}`, title: `${role} · x`, model: SONNET }, [], [], teams)
  for (const [role, kit] of [['Programmer', 'setup'], ['Designer', 'site'], ['Animator', 'game']]) {
    assert.match(ask(role, kit, 'M', role === 'Animator' ? '\nSheet: n/a scene animation, no body model' : '').block ?? '', /Gate:/, `${role} M without the line is refused`)
  }
  assert.deepEqual(ask('Programmer', 'setup', 'S'), {}, 'size S needs none')
  assert.deepEqual(ask('Programmer', 'setup', 'M', '\nGate: Reviewer · x before owner'), {}, 'with the line it starts')
  assert.match(ask('Programmer', 'setup', 'M', '\nGate: later').block ?? '', /Gate:/, 'the line says before owner')
  assert.deepEqual(decide(START, { brief: `Role: Reviewer · Kit: setup · Size: M${FULL.replace(/\nGate:[^\n]*/, '')}`.replace('Prior art: none, because a test brief', 'Prior art: gate.md and the setup checks -> adapt, because they exist'), title: 'Reviewer · x', model: teams.match(/Opus \((claude-[\w.-]+)\)/)[1] }, [], [], teams), {}, 'a gate role is not asked for a Gate line')
})

test('the generator fills the Gate line for builder, designer and animator briefs at M and L, and only there', () => {
  const m = buildBrief({ teams, role: 'Programmer', kit: 'setup', size: 'M', ...FIELDS })
  assert.match(m.brief, /\nGate: Reviewer · x before owner\n/)
  assert.match(buildBrief({ teams, role: 'Programmer', kit: 'setup', size: 'M', ...FIELDS, gate: 'Reviewer · fit round 2' }).brief, /\nGate: Reviewer · fit round 2 before owner\n/)
  assert.doesNotMatch(buildBrief({ teams, role: 'Programmer', kit: 'setup', size: 'S', ...FIELDS }).brief, /\nGate:/)
  assert.doesNotMatch(buildBrief({ teams, role: 'Reviewer', kit: 'setup', size: 'M', ...FIELDS }).brief, /\nGate:/)
})

// Gate round 2: extra words after the role must not skip the demand; a Gate line must name a reviewer or say why no owner-facing result exists.
test('the Gate demand cannot be skipped with words after the role, and a Gate line names a reviewer or says why none is needed', () => {
  const noGate = FULL.replace(/\nGate:[^\n]*/, '')
  const ask = (roleLine, gate) => decide(START, { brief: `${roleLine} · Kit: setup · Size: M${noGate}${gate ? `\nGate: ${gate}` : ''}`, title: 'Programmer · x', model: SONNET }, [], [], teams)
  assert.match(ask('Role: Programmer for slice 2').block ?? '', /Gate:/)
  assert.match(ask('Role: Programmer - slice 2').block ?? '', /Gate:/)
  for (const bad of ['none before owner', 'skipped, not before owner', 'later', 'n/a', 'n/a no']) assert.match(ask('Role: Programmer', bad).block ?? '', /Gate:/, bad)
  for (const good of ['Reviewer · fit round 2 before owner', 'Tester · app before owner', 'n/a no owner-facing result, a CI script only']) assert.deepEqual(ask('Role: Programmer', good), {}, good)
})

test('the generator passes a `--gate n/a <why>` through and refuses a Gate that names no reviewer', () => {
  const g = (gate) => () => buildBrief({ teams, role: 'Programmer', kit: 'setup', size: 'M', ...FIELDS, gate })
  assert.match(g('n/a no owner-facing result, a CI script only')().brief, /\nGate: n\/a no owner-facing result, a CI script only\n/)
  assert.throws(g('none'), (e) => e instanceof BriefError && /--gate/.test(e.message))
  assert.throws(g('n/a'), (e) => e instanceof BriefError && /--gate/.test(e.message))
})

test('the Gate line has a home: the brief block in briefs.md and the owner-facing rule in gate.md, both tagged with the hook that enforces them', () => {
  const briefs = readFileSync(join(root, '.claude/skills/operator/briefs.md'), 'utf8')
  const gate = readFileSync(join(root, '.claude/skills/operator/gate.md'), 'utf8')
  assert.match(briefs, /^Gate: <Reviewer thread> before owner[^\n]*\[guard: hook global\/team-guard\.mjs\]/m)
  assert.match(gate, /Owner-facing results[^\n]*Gate:[^\n]*\[guard: hook global\/team-guard\.mjs\]/)
})

// M30: the coordinator has no Bash, so each role's brief is a rendered file it fills; a filled file must pass team-guard at every size it offers.
test('a rendered brief file per role passes team-guard once its <...> are filled, at every size and model it offers', async () => {
  const { briefFile, briefFileName, modelFor } = await import('./brief.mjs')
  const { rosterNames } = await import('../global/team-guard.mjs')
  const roles = rosterNames(teams).filter((r) => briefFile(r, teams))
  assert.ok(roles.length >= 10 && !roles.includes('Project Manager'), 'the roles with a model tier have a file, the project chat has none')
  for (const role of roles) {
    const block = briefFile(role, teams).match(/```\n([\s\S]*?)```/)[1]
    const cell = block.match(/Kit: <([^>]+)>/)[1].split(' | ')
    const offered = block.match(/Size: <([^>]+)>/)[1].split('|')
    for (const [name, only] of cell.map((c) => [c.match(/^[\w-]+/)[0], c.match(/size ([SML]( or [SML])*) only/)?.[1].split(' or ')])) for (const size of only ?? offered) {
      const kit = name
      const model = modelFor(role, size, teams)
      const filled = block.split('\n').filter((l) => !/^(Look-Lock|Topic):/.test(l) && (size === 'L' || !/^Tester:/.test(l)))
        .map((l) => l.replace(/^Sheet: .*/, 'Sheet: n/a this slice is no body, face or outfit job').replace(/Size: <[^>]+>/, `Size: ${size}`).replace(/Kit: <[^>]+>/, `Kit: ${kit}`)
          .replace(/^Model: .*/, `Model: ${model}`).replace(/^Gate: .*/, 'Gate: Reviewer · x before owner')
          .replace(/<[^>\n]+>/g, (m) => (/PLAN\.json/.test(m) ? 'M30' : /^<sources/.test(m) ? 'obra/superpowers' : 'something concrete for this task'))).join('\n')
      const out = decide(START, { brief: filled, title: `${role} · x`, model }, [], [], teams)
      assert.equal(out.block, undefined, `${role} at ${size}: ${out.block}`)
    }
    assert.match(briefFileName(role), /^[a-z0-9-]+\.md$/)
  }
  assert.equal(modelFor('Planner', 'L', teams), teams.match(/Fable \((claude-[\w.-]+)\)/)[1])
  assert.match(briefFile('Planner', teams), /Model: <claude-opus[\w.-]* at size M \| claude-fable[\w.-]* at size L>/, 'the Planner file offers the model per size')
})
