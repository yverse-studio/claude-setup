// #437: a PR branch is code-frozen while its gate runs on a head. The home is gate.md, Rounds. Run: node --test scripts/gate-freeze.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const gate = readFileSync(join(root, '.claude/skills/operator/gate.md'), 'utf8')
const rounds = gate.slice(gate.indexOf('\n## Rounds'), gate.indexOf('\n## ', gate.indexOf('\n## Rounds') + 5))
const bullet = rounds.split(/\n(?=- \*\*)/).find((b) => /frozen/i.test(b)) ?? ''

test('gate.md Rounds has one bullet that freezes a head while its gate runs', () => {
  assert.ok(bullet, 'a Rounds bullet says the head is frozen')
  assert.equal((rounds.match(/frozen/gi) ?? []).length, 1, 'said once, in one place')
})

test('the bullet says who waits, the sha the gate names, what a push in between means, and is tagged advisory', () => {
  assert.match(bullet, /builder/i)
  assert.match(bullet, /pushes? nothing|no push|does not push/i)
  assert.match(bullet, /new head|new round/i)
  assert.match(bullet, /\[advisory\]/)
})

test('it covers the playtest as well as the gate, and both sides name the sha (#437: "its gate or playtest", "names the frozen sha")', () => {
  assert.match(bullet, /gate or playtest/i, 'the playtest is named')
  assert.match(bullet, /request names the head sha/i, 'the request names the sha')
  assert.match(bullet, /gate's first line names the sha it judged/i, 'the gate side names the sha it judged')
  assert.match(bullet, /two different shas/i, 'a push in between shows as two shas')
})
