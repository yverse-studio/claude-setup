import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkGdd, REQUIRED_HEADINGS, PLACEHOLDER } from './gdd-check.mjs'

const GOOD = `# Game design: Bug Garden
## Core loop
Dash through the swarm; each kill drops dew that pulls toward you.
## Session length
Runs last 180 to 300 seconds.
## Progression
After run 1 two upgrades are owned; 12 upgrades in the pool.
## Difficulty curve
| Minute | Pressure | Win rate |
|---|---|---|
| 1 | 5 enemies | 95% |
| 4 | 40 enemies | 40% |
## Feel and feedback
Hit stop 60 ms, number pop on every hit.
## Monetisation hooks
Midgame ad between nights, never during a fight.
## Not this
- no meta shop
- no PvP
## References
- A (https://www.crazygames.com/a, read 2026-10-18): 3 min runs. Copy: pacing. Skip: popups.
- B (https://www.crazygames.com/b, read 2026-10-18): 5 min runs. Copy: upgrade choice. Skip: story.
- C (https://www.crazygames.com/c, read 2026-10-18): 2 min runs. Copy: juice. Skip: ads at start.
Not checked:
- paid games
`
const without = (re) => GOOD.replace(re, '')

test('a complete doc passes', () => assert.deepEqual(checkGdd(GOOD), []))
test('the shipped template fails until it is filled in', () => {
  const t = readFileSync(new URL('../../operator/templates/game-design.md', import.meta.url), 'utf8')
  assert.ok(checkGdd(t).length > 0)
  for (const h of REQUIRED_HEADINGS) assert.ok(t.includes(`## ${h}`), h)
})
test('a missing heading fails', () => assert.match(checkGdd(without(/## Progression\n.*\n/)).join(), /no "## Progression"/))
test('an empty section fails', () => assert.match(checkGdd(GOOD.replace(/## Core loop\n.*\n/, '## Core loop\n')).join(), /Core loop is empty/))
test('a session length without a number fails', () => assert.match(checkGdd(GOOD.replace('180 to 300 seconds', 'a few minutes')).join(), /Session length has no number/))
test('a curve table with one row fails', () => assert.match(checkGdd(without(/\| 4 \|.*\n/)).join(), /Difficulty curve: a table/))
test('fewer than two NOT lines fails', () => assert.match(checkGdd(without(/- no PvP\n/)).join(), /Not this/))
test('fewer than three references fails', () => assert.match(checkGdd(without(/- C \(.*\n/)).join(), /2 of 3 games/))
test('a reference without a link, Copy or Skip fails', () => {
  assert.match(checkGdd(GOOD.replace('https://www.crazygames.com/a', 'crazygames')).join(), /without a link/)
  assert.match(checkGdd(GOOD.replace('Copy: pacing.', 'Take pacing.')).join(), /without "Copy:"/)
  assert.match(checkGdd(GOOD.replace('Skip: story', 'no story')).join(), /without "Skip:"/)
})
test('every placeholder the template carries is one the checker knows', () => {
  const t = readFileSync(new URL('../../operator/templates/game-design.md', import.meta.url), 'utf8')
  const all = t.match(/<[^<>\n]+>/g)
  assert.deepEqual(all, t.match(PLACEHOLDER))
})
test('a reference without the day read fails', () => assert.match(checkGdd(GOOD.replace(', read 2026-10-18)', ')')).join(), /without the day read/))
test('ordinary game text passes: tags, comparisons, CRLF, star bullets, bold labels', () => {
  const ordinary = [
    GOOD.replace('Dash through', 'Press <kbd>Space</kbd> or tap a <canvas> button; dash through'),
    GOOD.replace('95%', '>=95% and <100%'),
    GOOD.replace(/\n/g, '\r\n'),
    GOOD.replace(/^- /gm, '* '),
    GOOD.replace(/Copy:/g, '**Copy:**').replace(/Skip:/g, '**Skip:**'),
  ]
  for (const doc of ordinary) assert.deepEqual(checkGdd(doc), [])
})
test('a left placeholder fails', () => assert.match(checkGdd(GOOD.replace('Bug Garden', '<name>')).join(), /placeholder/))
test('a doc without Not checked fails', () => assert.match(checkGdd(without(/Not checked:\n.*\n/)).join(), /Not checked/))
test('the CLI exits 1 on a missing file', () => {
  const r = spawnSync('node', [fileURLToPath(new URL('./gdd-check.mjs', import.meta.url)), '/nonexistent/GDD.md'], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /does not exist/)
})
