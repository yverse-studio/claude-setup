// `team-guard.mjs check` (CompanyXY 2026-11-13, brief-fix item 3): the coordinator checks a brief with the guard's own validator before start_thread.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildBrief } from './brief.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const script = join(root, 'global', 'team-guard.mjs')
const run = (args, input) => spawnSync(process.execPath, [script, 'check', ...args], { input, encoding: 'utf8', cwd: root })
const teams = readFileSync(join(fileURLToPath(import.meta.url), '..', '..', 'docs/TEAMS.md'), 'utf8')
const opusId = teams.match(/Opus \((claude-[\w.-]+)\)/)[1]
const dir = mkdtempSync(join(tmpdir(), 'check-brief-'))
const BAD = ['Role: Character TD · Kit: references · Size: M', 'Item: new', 'Plan: p.md', 'Acceptance: ok', 'Model: opus', 'Skills: blender-body', 'Done when: x', 'Stop when: 3', 'Start: read MEMORY.md first', 'Threads: none open on this topic'].join('\n')

test('a bad brief: every problem on its own line in one run, exit 1, and the exact model id of the role', () => {
  const file = join(dir, 'bad.md')
  writeFileSync(file, BAD)
  const r = run(['Character TD', file])
  assert.equal(r.status, 1)
  const lines = r.stdout.split('\n').filter((l) => /^\(\d+\)/.test(l))
  assert.ok(lines.length >= 3, `one line per problem: ${r.stdout}`)
  for (const part of [/Kit: references is no kit/, /Gate:/, /Sheet:/, /Look-Lock:/, /Prior art/]) assert.match(r.stdout, part)
  assert.match(r.stdout, /^model: claude-sonnet-\S+ \(pass this as `model`\)$/m, 'the id to pass is printed, not a tier')
  assert.equal(run(['Character TD', file, '--model', opusId]).status, 1)
  assert.match(run(['Character TD', file, '--model', opusId]).stdout, /runs on sonnet/, 'a given model is checked as well')
})

test('a brief the generator built passes, from a file and from stdin; a role that differs from the Role line is a problem', () => {
  const { brief } = buildBrief({ role: 'Programmer', kit: 'setup', size: 'S', item: 'new', plan: 'n/a, size S', acceptance: 'the test passes', threads: 'list_threads checked, none open on this topic', priorArt: 'obra/superpowers -> adapt, because the skill exists', done: 'node --test', stop: '3 rounds', skills: '.claude/skills/operator/roles/programmer.md' })
  const ok = run(['Programmer', '-'], brief)
  assert.equal(ok.status, 0, ok.stdout)
  assert.match(ok.stdout, /^ok: this brief passes the start check/m)
  assert.match(ok.stdout, /^model: claude-sonnet-\S+/m)
  const other = run(['Reviewer', '-'], brief)
  assert.equal(other.status, 1)
  assert.match(other.stdout, /the brief starts Role: Programmer but you named Reviewer/)
  assert.equal(run([]).status, 2, 'no role: usage, exit 2')
  assert.equal(run(['Nobody', '-'], brief).status, 2, 'a role the Roster does not list: exit 2')
})

// Brief-fix item 4: briefs/<role>.md is the one copyable template per role (rendered from BRIEF_FIELDS and docs/TEAMS.md). Filled with plain values, every one passes check-brief.
test('every rendered briefs/<role>.md template, filled in, passes the start check on each of its kits', async () => {
  const { renderBrief } = await import('../global/card-render.mjs')
  const { rosterNames } = await import('../global/team-guard.mjs')
  const FILL = { Model: null, Skills: null, Item: 'Item: M50', Plan: 'Plan: p.md', Acceptance: 'Acceptance: the test passes', Threads: 'Threads: list_threads checked, none open on this topic',
    'Prior art': 'Prior art: obra/superpowers -> adapt, because the skill exists', Sheet: 'Sheet: n/a no body, face or outfit job here, a script only', Gate: 'Gate: Reviewer · x before owner',
    Researcher: 'Researcher: Opus subagent', Tester: 'Tester: Tester · app', 'Done when': 'Done when: node --test', 'Stop when': 'Stop when: 3 rounds', Start: 'Start: read MEMORY.md first' }
  let checked = 0
  for (const role of rosterNames(teams)) {
    const file = renderBrief(role, teams)
    if (!file) continue
    const block = file.match(/```\n([\s\S]*?)```/)[1].split('\n').filter(Boolean)
    const stamp = block[0].match(/^Role: (.+?) · Kit: <(.+?)> · Size: <(.+?)>$/)
    assert.ok(stamp, `${role}: stamp line`)
    for (const cell of stamp[2].split(' | ')) {
      const kit = cell.replace(/ \(.*/, '')
      const sizes = cell.match(/size ([SML])(?: or ([SML]))? only/)?.slice(1).filter(Boolean) ?? stamp[3].split('|')
      const size = sizes.includes('S') ? 'S' : sizes[0]
      const lines = [`Role: ${role} · Kit: ${kit} · Size: ${size}`]
      for (const l of block.slice(1)) {
        const key = l.match(/^([A-Z][\w -]*?):/)[1]
        if (['Round', 'Asset', 'Picture card', 'Topic', 'Look-Lock'].includes(key)) continue
        lines.push(key === 'Model' || key === 'Skills' ? l : key === 'Prior art' && !l.includes('<sources') ? l.replace(/<kit>/g, kit) : FILL[key] ?? assert.fail(`${role}: no fill for ${key}`))
      }
      const r = run([role, '-'], lines.join('\n'))
      assert.equal(r.status, 0, `${role} on ${kit} at ${size}:\n${lines.join('\n')}\n${r.stdout}`)
      checked++
    }
  }
  assert.ok(checked >= 20, `${checked} role and kit templates checked`)
})
