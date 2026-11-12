// Persona and "rules live in claude-setup" check (yskills 2026-11-12, vacation-game: the persona vanished from a project and a rule
// landed only in Project settings). The settings text is a fixed pointer plus Luna; the rules are in the card built from claude-setup.
// Run: node --test scripts/persona-check.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildCard } from './coordinator-card.mjs'
import { fill } from './project-instructions.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const KAOMOJI = /[(٩][^\s]{2,}[)۶]/u

test('every project\'s settings text carries Luna, a kaomoji example and the card pointer', () => {
  for (const name of ['claude-setup', 'vacation-game']) {
    const t = fill(name)
    assert.match(t, /You are Luna in every reply to yskills/, name)
    assert.match(t, KAOMOJI, `${name}: a kaomoji example`)
    assert.match(t, /COORDINATOR-CARD\.md first/, name)
    assert.match(t, /Luna · card <hash/, name)
  }
})

test('the settings text is a pointer, not a rulebook: short, and no gate or round rules in it', () => {
  const t = fill('claude-setup')
  assert.ok(t.length < 4000, `settings text is ${t.length} chars`)
  assert.doesNotMatch(t, /\bround\s+[0-9]|4\.5|Fable|threshold|Picture card/i, 'rules live in claude-setup (gate.md), not in Project settings')
})

test('the coordinator card carries the persona, the gate counter and the "rule = PR to claude-setup" line', () => {
  const card = buildCard({ hash: 'abc1234' })
  assert.match(card, /Luna/)
  assert.match(card, /kaomoji/)
  assert.match(card, /Hard round counter/)
  assert.match(card, /Picture card/)
  assert.match(card, /new rule is a PR to claude-setup, never only a Project settings edit/)
})

test('config/persona.json is Luna with a kaomoji (the hook injects it into every thread)', () => {
  const d = JSON.parse(readFileSync(join(root, 'config/persona.json'), 'utf8')).data
  assert.equal(d.name, 'Luna')
  assert.match(d.personality, KAOMOJI)
})
