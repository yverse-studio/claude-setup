import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { measure, compare } from './rule-budget.mjs'

const has = (p) => p === 'scripts/x.test.mjs'

test('counts never/must/always and "no ... without" lines; skips headings, code fences, plain prose', () => {
  const text = ['# Never a rule heading', '', '- Never push to main.', '- A hard', '  wrapped line must count once.', '- Plain sentence.', '```', 'always in code', '```', '- No deploy without a gate.'].join('\n')
  const m = measure([['a.md', text]], has)
  assert.equal(m.perFile['a.md'], 3)
  assert.equal(m.total, 3)
})

test('a rule line with a [guard: ...] naming an existing file is not counted; a missing file is a problem', () => {
  const ok = measure([['a.md', '- Never skip a test. [guard: test scripts/x.test.mjs]']], has)
  assert.equal(ok.total, 0)
  assert.deepEqual(ok.badGuards, [])
  const bad = measure([['a.md', '- Never skip a test. [guard: test scripts/gone.test.mjs]']], has)
  assert.equal(bad.total, 1)
  assert.equal(bad.badGuards.length, 1)
  assert.match(compare(bad, { perFile: { 'a.md': 1 } }).join('\n'), /scripts\/gone\.test\.mjs/)
})

test('a new unguarded rule line fails, a removed one passes, a new file starts at zero', () => {
  const base = { perFile: { 'a.md': 2 } }
  const grown = measure([['a.md', '- Never a.\n- Always b.\n- Must c.']], has)
  assert.match(compare(grown, base).join('\n'), /a\.md.*3.*2|a\.md: 1 new/)
  assert.deepEqual(compare(measure([['a.md', '- Never a.']], has), base), [])
  assert.match(compare(measure([['new.md', '- Never a.']], has), base).join('\n'), /new\.md/)
})

test('the repo itself is within its frozen baseline', () => {
  const out = execFileSync('node', ['scripts/rule-budget.mjs'], { encoding: 'utf8' })
  assert.match(out, /^rule budget: \d+ unguarded rule lines/)
})
