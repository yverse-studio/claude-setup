// The Character TD role and its two skills (yskills 2026-11-12: "Rollenkarte 3D Modeller / Character TD / Outfit Artist plus
// Skills garment-fit und texture-recolour"). Red before the role is registered, green after.
// Run: node --test scripts/character-td.test.mjs
import assert from 'node:assert/strict'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const teams = read('docs/TEAMS.md')
const CARD = '.claude/skills/operator/roles/character-td.md'
// The brief block every thread start carries (operator/briefs.md), as team-guard demands it.
const FULL = '\nModel: sonnet\nThreads: list_threads checked, none open on this topic\nSkills: garment-fit, texture-recolour\nSheet: /mnt/project-files/game-dev/rika-cast-sheet.md\nLook-Lock: owner card https://example.invalid/card/rika\nDone when: the fit report is green\nStop when: a look needs yskills\nStart: read MEMORY.md first\nPrior art: clothes library and fit_garment.py checked; refit, because the garment exists'

test('roster: Character TD is a row that points at its card and names a model', async () => {
  const { roleOf } = await import('../global/rule-guard.mjs')
  const role = roleOf('Role: Character TD · Kit: game · Size: M', teams)
  assert.ok(role?.row, 'the Roster has a Character TD row')
  assert.equal(role.name, 'Character TD')
  assert.equal(role.path, CARD)
  assert.match(role.row, /Model: Sonnet/)
})

test('team guard: Character TD starts on game and story, not on site, app or setup, and runs on Sonnet', async () => {
  const { decide } = await import('../global/team-guard.mjs')
  const brief = (kit, model = 'claude-sonnet-x') => ({ brief: `Role: Character TD · Kit: ${kit} · Size: M${FULL}`, title: 'Character TD · refit boots', model })
  for (const kit of ['game', 'story']) assert.deepEqual(decide('mcp__hearthbot__start_thread', brief(kit), [], [], teams), {}, `passes on ${kit}`)
  for (const kit of ['site', 'app', 'setup']) assert.match(decide('mcp__hearthbot__start_thread', brief(kit), [], [], teams).block ?? '', /not on the `\w+` kit's team/, `skipped on ${kit}`)
  const noSheet = brief('game'); noSheet.brief = noSheet.brief.replace(/\nSheet:[^\n]*\nLook-Lock:[^\n]*/, '')
  assert.match(decide('mcp__hearthbot__start_thread', noSheet, [], [], teams).block ?? '', /Sheet:/, 'a Character TD fit brief needs the approved cast sheet like the Programmer and Animator')
  assert.match(decide('mcp__hearthbot__start_thread', brief('game', 'claude-opus-x'), [], [], teams).block ?? '', /runs on sonnet/, 'Sonnet, not Opus')
})

test('role card: the combined role, its two skills, the docs-first rule and the hand-off to the gate', () => {
  assert.ok(existsSync(join(root, CARD)), `${CARD} exists`)
  const card = read(CARD)
  assert.match(card, /^# 3D Modeller \/ Character TD \/ Outfit Artist/m)
  for (const s of ['garment-fit', 'texture-recolour', 'blender-body', 'Docs read:', 'clothes_dupe.py', 'character-workflow.md']) assert.ok(card.includes(s), `card names ${s}`)
  assert.match(card, /hands? .*numbers.* to the gate/is, 'it judges nothing itself (TEAMS.md, Who checks)')
})

for (const [name, must] of [
  ['garment-fit', ['prefit_garment.py', 'fit_garment.py', 'clothes_dupe.py', 'FIT_SW', 'FIT_SUB', 'Foot_In_Shoe', 'CH_', 'BT_', 'clearance.py', 'Hide_CL_', 'refit']],
  ['texture-recolour', ['UV island', 'ID mask', 'HSV', 'only inside the mask', 'before/after', 'recolour.py', 'grey']],
]) {
  test(`skill ${name}: file, frontmatter, the named parts, loaded by project threads`, () => {
    const file = `.claude/skills/${name}/SKILL.md`
    assert.ok(existsSync(join(root, file)), `${file} exists`)
    const text = read(file)
    assert.match(text, new RegExp(`^---\\nname: ${name}\\ndescription: .{40,}`, 's'))
    for (const s of must) assert.ok(text.includes(s), `${name} names ${s}`)
    const link = join(root, 'mods/setup-domains/skills', name)
    assert.ok(lstatSync(link).isSymbolicLink(), `mods/setup-domains/skills/${name} links the skill (project threads load only plugin skills)`)
    assert.ok(existsSync(join(link, 'SKILL.md')), 'the link resolves')
  })
}

test('garment-fit restates no number of docs/clothing-pipeline.md', () => {
  assert.doesNotMatch(read('.claude/skills/garment-fit/SKILL.md'), /\b\d+(\.\d+)? ?(mm|%)|\d+ to \d+/, 'a number here would drift from its home')
})

test('map and kits: one home each, linked from MAP.md and the game and story kits', () => {
  const map = read('docs/MAP.md')
  for (const s of ['garment-fit', 'texture-recolour', 'character-td.md']) assert.ok(map.includes(s), `MAP.md names ${s}`)
  const kit = (k) => teams.split('\n').find((l) => l.startsWith(`| \`${k}`)) ?? ''
  for (const k of ['game', 'story']) assert.match(kit(k).split('|')[3], /Character TD/, `${k} team has the Character TD`)
  for (const k of ['site', 'app', 'setup']) assert.match(kit(k).split('|')[4], /Character TD/, `${k} skips the Character TD`)
})
