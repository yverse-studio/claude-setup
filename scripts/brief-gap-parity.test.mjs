// #684 (F2): the thread-side refusal and `team-guard.mjs check` print different lists on purpose (M50: the thread fills the derived and recoverable lines itself),
// but two things must hold for every brief: every judgment gap the thread refuses for is named by the check, and a brief the check passes is never refused.
// Run: node --test scripts/brief-gap-parity.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { BRIEF_FIELDS, briefProblems, classify } from '../global/team-guard.mjs'
import { briefCheck } from '../global/rule-guard.mjs'
import { modelFor } from '../global/card-render.mjs'

process.env.PLAN_FILE = '/nonexistent/PLAN.json'
const root = join(fileURLToPath(import.meta.url), '..', '..')
const teams = readFileSync(join(root, 'docs', 'TEAMS.md'), 'utf8')
const checklists = readFileSync(join(root, '.claude/skills/operator/checklists.md'), 'utf8')
const spawn = (brief) => `<wake reason="spawn"><relay>${brief}</relay></wake>`
const FULL = ['Item: M50', 'Plan: p.md', 'Acceptance: tests pass', 'Model: sonnet', 'Skills: x', 'Done when: tests pass', 'Stop when: 3 rounds', 'Start: read MEMORY.md first',
  'Threads: list_threads checked, none open on this topic', 'Prior art: obra/superpowers -> adapt, because it exists', 'Gate: Reviewer · x before owner', 'Sheet: sheet.md', 'Target image: lib/characters/CH_x/approval/A.png', 'Source: lib/characters/CH_x/source/A.blend']
const modelOf = (role, brief) => modelFor(role, brief.match(/\bSize:[ \t]*([SML])\b/i)?.[1] ?? 'M', teams) // the Roster row's id, as the check prints it
const BRIEFS = [
  ['Programmer', 'Role: Programmer · Kit: game · Size: M\nItem: #5\nBuild the thing.'],
  ['Programmer', 'Role: Programmer · Kit: game · Size: M\nBuild the thing.'],
  ['Programmer', 'Role: Programmer · Kit: setup · Size: S\nFix a typo.'],
  ['Programmer', 'Role: Programmer · Kit: setup · Size: L\nItem: #5\nBuild the thing.'],
  ['Planner', 'Role: Planner · Kit: setup · Size: S\nDo a plan.'],
  ['Planner', 'Role: Planner · Kit: setup · Size: M\nItem: M3\nPlan: p.md\nAcceptance: a plan\nDo a plan.'],
  ['Programmer', ['Role: Programmer · Kit: game · Size: M', 'Build the thing.', ...FULL].join('\n')],
  ['Programmer', ['Role: Programmer · Kit: setup · Size: M', 'Build the thing.', ...FULL.filter((l) => !/^(Sheet|Target image|Source|Gate)/.test(l))].join('\n')],
]

test('every judgment gap the thread names is named by the check, and a brief the check passes is not refused', async () => {
  for (const [role, brief] of BRIEFS) {
    const found = briefProblems(brief, { model: modelOf(role, brief), title: `${role} · check`, teams, checklists }).join('\n')
    const refusal = await briefCheck(spawn(brief), root, modelOf(role, brief))
    for (const f of classify(brief).judgment) {
      const label = BRIEF_FIELDS.find((x) => x.key === f.key)
      assert.ok(found.includes(label.name ?? label.key) || /Tester/.test(f.key), `${f.key} is a judgment gap of the thread; the check names it (${brief.split('\n')[0]})\n${found}`)
    }
    if (!found) assert.doesNotMatch(refusal, /^Brief check/, `the check passes but the thread refuses (${brief.split('\n')[0]}):\n${refusal}`)
  }
})

test('the two lists differ by design: the thread names the judgment gaps only, the check also names the lines the thread fills itself', async () => {
  const brief = 'Role: Programmer · Kit: game · Size: M\nItem: #5\nBuild the thing.'
  const found = briefProblems(brief, { model: modelOf('Programmer', brief), title: 'Programmer · check', teams, checklists }).join('\n')
  const refusal = await briefCheck(spawn(brief), root, modelOf('Programmer', brief))
  assert.match(found, /Sheet:[\s\S]*Target image:[\s\S]*Source:/)
  assert.match(refusal, /Sheet is missing[\s\S]*Target image is missing[\s\S]*Source is missing/)
  assert.match(found, /Model:, Skills:/)
  assert.doesNotMatch(refusal.split('Do no work')[0], /Skills/, 'a derived line is no refusal reason')
})
