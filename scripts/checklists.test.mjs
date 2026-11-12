// M48: fixed gate checklists per topic, `Topic:` in a Reviewer brief, and a Reviewer with a Topic gets checklist plus Scored gates (not the code playbook).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { BOOT_FILES, CHECKLISTS, badTopic, decide, topicNames } from '../global/team-guard.mjs'
import { topicPlaybook } from '../global/rule-guard.mjs'
import { buildBrief, BriefError } from './brief.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
const checklists = readFileSync(join(root, CHECKLISTS), 'utf8')
const SONNET = teams.match(/Sonnet \((claude-[\w.-]+)\)/)[1]
const OPUS = teams.match(/Opus \((claude-[\w.-]+)\)/)[1]
const TOPICS = ['Garment', 'Hair', 'Character', 'HUD/UI', 'Animation', 'Scene render', 'Asset-Intake']
const REVIEWER = (topic) => `Role: Reviewer · Kit: game · Size: M\nModel: ${OPUS}\nItem: M48\nThreads: list_threads checked, none open\nPrior art: .claude/skills/operator/gate.md and the game kit's checks -> adapt, because they exist\nSkills: x\n${topic ? `Topic: ${topic}\n` : ''}Done when: verdict\nStop when: two rounds\nStart: read MEMORY.md first`

test('the checklist file has the seven topics, each with a body', () => {
  assert.deepEqual(topicNames(checklists), TOPICS)
  for (const t of TOPICS) {
    const body = checklists.split(/^## /m).find((s) => s.startsWith(`${t}\n`)) ?? ''
    assert.ok(body.split('\n').slice(1).join('').trim().length > 20, `${t} has a body`)
    assert.ok((body.match(/^\d+\. \*\*/gm) ?? []).length >= 5, `${t} has 5 or more numbered rows`)
  }
  assert.doesNotMatch(checklists, /TODO\(Opus gate\)/, 'no placeholder left')
})

test('badTopic: an unknown Topic and a Topic on a non-Reviewer brief are refused, a known or absent one passes', () => {
  assert.match(badTopic(REVIEWER('Cooking'), checklists) ?? '', /Topic: Cooking is no topic[\s\S]*Garment/)
  assert.match(badTopic(REVIEWER('Garment').replace('Role: Reviewer', 'Role: Programmer'), checklists) ?? '', /Reviewer brief only/)
  for (const t of TOPICS) assert.equal(badTopic(REVIEWER(t), checklists), null, t)
  assert.equal(badTopic(REVIEWER(null), checklists), null)
  assert.equal(badTopic(REVIEWER('Cooking'), ''), null, 'no checklist file, nothing to compare')
})

test('team-guard blocks a thread start with an unknown Topic and lets a known one through', () => {
  const start = (topic) => decide('mcp__hearthbot__start_thread', { brief: REVIEWER(topic), title: 'Reviewer · M48', model: OPUS }, [], [], teams, checklists)
  assert.match(start('Cooking').block ?? '', /Topic: Cooking is no topic/)
  assert.deepEqual(start('Garment'), {})
})

test('the generator writes Topic and the checklist into a Reviewer brief, and refuses an unknown topic', () => {
  const out = buildBrief({ role: 'Reviewer', kit: 'game', size: 'M', item: 'M48', threads: 'list_threads checked', done: 'verdict', stop: 'two rounds', what: 'garment gate', topic: 'Garment', checklists })
  assert.match(out.brief, /^Topic: Garment$/m)
  assert.match(out.brief, /Prior art:[^\n]*gate\.md[^\n]*checklists\.md/)
  assert.throws(() => buildBrief({ role: 'Reviewer', kit: 'game', size: 'M', item: 'M48', threads: 'x', done: 'v', stop: 's', what: 'w', topic: 'Cooking', checklists }), BriefError)
  assert.throws(() => buildBrief({ role: 'Programmer', kit: 'setup', size: 'S', item: 'M48', threads: 'x', done: 'v', stop: 's', priorArt: 'p', topic: 'Garment', checklists }), BriefError)
})

test('a Reviewer with a Topic gets that checklist plus Scored gates, not the code playbook', async () => {
  const pb = await topicPlaybook(REVIEWER('HUD/UI'), root)
  assert.ok(pb, 'a playbook came back')
  assert.match(pb.text, /HUD\/UI/)
  assert.match(pb.text, /Scored gates \(the score rule\)/)
  assert.doesNotMatch(pb.text, /Reads the code diff for bugs/)
  assert.doesNotMatch(pb.text, /^## Garment/m, 'only its own topic')
  assert.equal(await topicPlaybook(REVIEWER(null), root), null, 'no Topic: the normal Reviewer playbook')
  assert.equal(await topicPlaybook(REVIEWER('Cooking'), root), null, 'unknown Topic: no card from here (the guard blocks the start)')
})

// Gate round 1 (#467): outside the claude-setup repo the guard read '' because the checklist file was never in the boot copy, so badTopic returned null.
test('the checklist file is part of the boot copy, and a thread start outside claude-setup with an unknown Topic is blocked', () => {
  assert.ok(BOOT_FILES.includes(CHECKLISTS), 'team-guard fetches the checklist file with the other boot files')
  const home = mkdtempSync(join(tmpdir(), 'cl-home-'))
  const cwd = mkdtempSync(join(tmpdir(), 'cl-cwd-'))
  try {
    for (const f of BOOT_FILES) { // what the boot fetch leaves in ~/.claude/claude-setup
      const dest = join(home, '.claude', 'claude-setup', f)
      mkdirSync(join(dest, '..'), { recursive: true })
      writeFileSync(dest, readFileSync(join(root, f), 'utf8'))
    }
    const start = (topic) => spawnSync(process.execPath, [join(root, 'global/team-guard.mjs'), 'pre'], {
      input: JSON.stringify({ cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: REVIEWER(topic), title: 'Reviewer · M48', model: OPUS } }),
      encoding: 'utf8', timeout: 5000, env: { ...process.env, CLAUDE_SETUP_HOME: home, CLAUDE_SETUP_BOOT_FETCH: 'off', CLAUDE_CODE_CHILD_SESSION: '' },
    })
    assert.match(start('Cooking').stderr, /Topic: Cooking is no topic/)
    assert.equal(start('Garment').status, 0)
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(cwd, { recursive: true, force: true }) }
})

test('a topic card takes the section of exactly that heading, not one that merely starts with it', async () => {
  const fake = mkdtempSync(join(tmpdir(), 'cl-root-'))
  try {
    mkdirSync(join(fake, '.claude/skills/operator'), { recursive: true })
    writeFileSync(join(fake, CHECKLISTS), '# Gate checklists\n\n## Hair-extensions\n\nWRONG-SECTION rows\n\n## Hair\n\nRIGHT-SECTION rows\n')
    writeFileSync(join(fake, '.claude/skills/operator/gate.md'), readFileSync(join(root, '.claude/skills/operator/gate.md'), 'utf8'))
    const pb = await topicPlaybook(REVIEWER('Hair'), fake)
    assert.match(pb.text, /RIGHT-SECTION/)
    assert.doesNotMatch(pb.text, /WRONG-SECTION/)
    assert.match(pb.text, /Scored gates \(the score rule\)/)
  } finally { rmSync(fake, { recursive: true, force: true }) }
})

test('a Topic brief from the generator lists the checklist as its skill, not the code playbook', () => {
  const out = buildBrief({ role: 'Reviewer', kit: 'game', size: 'M', item: 'M48', threads: 'list_threads checked, none open', done: 'v', stop: 's', what: 'w', topic: 'Hair', checklists })
  assert.match(out.brief, /^Skills: \.claude\/skills\/operator\/checklists\.md$/m)
})
