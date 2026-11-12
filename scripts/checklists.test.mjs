// M48: fixed gate checklists per topic, `Topic:` in a Reviewer brief, and a Reviewer with a Topic gets checklist plus Scored gates (not the code playbook).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { CHECKLISTS, badTopic, decide, topicNames } from '../global/team-guard.mjs'
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
  }
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
