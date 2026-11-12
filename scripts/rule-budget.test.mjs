import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { measure, compare } from './rule-budget.mjs'

const guards = { 'test scripts/x.test.mjs': 1, 'hook global/h.mjs': 1, 'deny Bash(rm *)': 1 }
const has = (kind, target) => `${kind} ${target}` in guards

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

test('deny/ask/hook guards count like check.mjs reads them; a json file or a loose path is no guard', () => {
  assert.equal(measure([['a.md', '- Never rm. [guard: deny Bash(rm *)]\n- Never x. [guard: hook global/h.mjs, `Threads:` line]']], has).total, 0)
  assert.equal(measure([['a.md', '- Never x. [guard: test config/rule-budget.json]']], has).total, 1)
  assert.equal(measure([['a.md', '- Never x. [guard: hook h.mjs]']], has).total, 1)
})

test('the budget is a ratchet: a file that fell below its budget or vanished fails until --freeze', () => {
  const base = { perFile: { 'a.md': 3, 'gone.md': 1 } }
  const out = compare(measure([['a.md', '- Never a.\n- Always b.']], has), base).join('\n')
  assert.match(out, /a\.md: fell to 2 from 3.*--freeze/)
  assert.match(out, /gone\.md: fell to 0 from 1/)
})

test('a new unguarded rule line fails, a new file starts at zero', () => {
  const base = { perFile: { 'a.md': 2 } }
  const grown = measure([['a.md', '- Never a.\n- Always b.\n- Must c.']], has)
  assert.match(compare(grown, base).join('\n'), /a\.md.*3.*2|a\.md: 1 new/)
  assert.deepEqual(compare(measure([['a.md', '- Never a.\n- Always b.']], has), base), [])
  assert.match(compare(measure([['new.md', '- Never a.']], has), base).join('\n'), /new\.md/)
})

test('the repo itself is within its frozen baseline', () => {
  const out = execFileSync('node', ['scripts/rule-budget.mjs'], { encoding: 'utf8' })
  assert.match(out, /^rule budget: \d+ unguarded rule lines/)
})
