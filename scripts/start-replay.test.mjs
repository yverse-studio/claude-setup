// #780: the thread-start check asks only for lines a thread cannot fill itself. Replays the 19 starts logged on 2026-11-22
// (scripts/fixtures/starts-2026-11-22.json) and pins the three changes: Gate only at size L, no Researcher line for a gate role,
// and a start whose only gaps are derived prints `Brief fill:` and counts as clean.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { classify } from '../global/team-guard.mjs'
import { briefCheck } from '../global/rule-guard.mjs'
import { startOutcome } from '../global/card-render.mjs'
import { buildBrief } from './brief.mjs'

process.env.PLAN_FILE = '/nonexistent/PLAN.json'
const root = join(fileURLToPath(import.meta.url), '..', '..')
const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
const spawn = (brief) => `<wake reason="spawn"><relay>${brief}</relay></wake>`
const check = (brief) => briefCheck(spawn(brief), root, null)
const FIELDS = { item: 'M1', plan: 'gate.md', acceptance: 'tests pass', threads: 'list_threads checked, none open on this topic', priorArt: 'yverse-studio/claude-setup checked -> adapt, because it exists', done: 'node --test passes', stop: 'two rounds', what: 'x', start: 'CLAUDE.md',
  sheet: 'docs/cast.md', targetImage: 'lib/characters/CH_x/approval/A.png', source: 'lib/characters/CH_x/source/A.blend', preGate: 'gate/x/PREGATE.md', level: 'research research/x.md · plan plans/x-PLAN.md · design design/x.md', tester: 'Tester · x', gate: 'Reviewer · x' }
const full = (role, kit, size) => buildBrief({ teams, role, kit, size, ...FIELDS }).brief
const without = (brief, ...keys) => brief.split('\n').filter((l) => !keys.some((k) => l.startsWith(`${k}:`))).join('\n')

test('replay of the 19 starts of 2026-11-22: most begin work, most are clean', async () => {
  const rows = JSON.parse(readFileSync(join(root, 'scripts/fixtures/starts-2026-11-22.json'), 'utf8'))
  assert.equal(rows.length, 19)
  const got = []
  for (const r of rows) {
    let brief
    // The log holds no brief text. Assumed: the one start logged without a stamp carried the loose spelling `Role · Kit · Size:` (#761 reads it since).
    // Without this row the replay is started 17, clean 12; the bounds below hold either way.
    if (!r.role) brief = full('Reviewer', 'setup', 'M').replace(/^Role: Reviewer · Kit: setup · Size: M/m, 'Role · Kit · Size: Reviewer · setup · M')
    else {
      brief = full(r.role, r.kit, r.size)
      for (const reason of r.reasons) {
        if (reason === 'Researcher') brief = `${brief}\nResearch SOTA on the topic first.`
        else if (reason === 'Item') brief = brief.replace(/^Item: .*/m, 'Item: soon')
        else if (reason.startsWith('Sheet')) brief = without(brief, 'Sheet')
        else if (reason.startsWith('Look-Lock')) continue
        else brief = without(brief, reason)
      }
    }
    const out = startOutcome(await check(brief))
    got.push({ ...r, now: out })
  }
  const n = (o) => got.filter((g) => g.now.outcome === o).length
  const msg = `clean ${n('clean')}, repaired ${n('repaired')}, refused ${n('refused')}\n${got.map((g) => `${g.role || '-'} ${g.size || '-'} logged ${g.outcome} [${g.reasons}] now ${g.now.outcome} [${g.now.reasons}]`).join('\n')}`
  assert.ok(n('clean') + n('repaired') >= 15, msg)
  assert.ok(n('clean') >= 12, msg)
  const game = got.find((g) => g.kit === 'game' && g.role === 'Programmer')
  assert.equal(game.now.outcome, 'refused', msg)
  console.log(msg)
})

test('#780 change 1: a missing Gate line is a self-fill at size M and an ask at size L', async () => {
  const plain = (size) => `Role: Programmer · Kit: setup · Size: ${size}\nResearch nothing.`
  assert.equal(classify(plain('M')).recoverable.some((f) => f.key === 'Gate'), false, 'M: no ask')
  assert.equal(classify(plain('M')).derived.some((f) => f.key === 'Gate'), true, 'M: a derived fill')
  assert.equal(classify(plain('L')).recoverable.some((f) => f.key === 'Gate'), true, 'L: Gate gap, recoverable')
  const out = await check(without(full('Programmer', 'setup', 'M'), 'Gate'))
  assert.match(out, /^Brief fill: Gate: none named; before yskills sees [^\n]*ask the coordinator[^\n]*Owner-facing results\)$/m)
  assert.doesNotMatch(out, /Brief repair/)
  assert.deepEqual(startOutcome(out), { outcome: 'clean', reasons: [] })
})

test('#780 change 1b: a Programmer brief at size L without Gate still gets the repair note naming Gate', async () => {
  const out = await check(without(full('Programmer', 'setup', 'L'), 'Gate'))
  assert.match(out, /^Brief repair \(no block\): the brief lacks[^\n]*Gate/m)
  assert.match(out, /Name the repaired lines in your first checklist line/)
})

test('#780 change 2: Researcher is not asked of a gate role; a Programmer or Planner brief that asks for research still gets the note', async () => {
  for (const role of ['Reviewer', 'Tester']) assert.equal(classify(`Role: ${role} · Kit: setup · Size: M\nResearch SOTA of this.`).recoverable.some((f) => f.key === 'Researcher'), false, role)
  for (const role of ['Programmer', 'Planner']) {
    const out = await check(`${without(full(role, 'setup', 'M'), 'Researcher')}\nResearch SOTA on the topic first.`)
    assert.match(out, /^Brief repair \(no block\): the brief lacks[^\n]*Researcher/m, role)
  }
})

test('#780 change 3: only derived gaps print `Brief fill:` and count as clean; a recoverable gap keeps the repair note', async () => {
  const base = full('Reviewer', 'setup', 'M')
  const fill = await check(without(base, 'Start'))
  assert.match(fill, /^Brief fill: Start: read MEMORY\.md first/m)
  assert.doesNotMatch(fill, /Brief repair|first checklist line/)
  assert.deepEqual(startOutcome(fill), { outcome: 'clean', reasons: [] })
  const both = await check(without(full('Programmer', 'setup', 'M'), 'Start', 'Threads'))
  assert.match(both, /^Brief fill: Start: read MEMORY\.md first$/m)
  assert.match(both, /^Brief repair \(no block\): the brief lacks Threads\. Work as if it read: Threads: [^\n]*Name the repaired lines in your first checklist line\./m)
  assert.deepEqual(startOutcome(both), { outcome: 'repaired', reasons: ['Threads'] })
})
