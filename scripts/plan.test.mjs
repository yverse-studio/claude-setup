import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { problems, setItem, addItem, stand } from './plan.mjs'

const base = () => ({ goal: 'Ship X', updated: '2026-11-12', items: [
  { id: 'M1', title: 'Checkout', status: 'done', owner: 'Programmer · checkout', evidence: 'https://github.com/o/r/pull/14' },
  { id: 'M2', title: 'Store listing', status: 'doing', owner: '[Programmer · store](#cmsg_y)' },
  { id: 'M3', title: 'Domain', status: 'wartet', owner: 'yskills', waits_on: 'his hands' },
  { id: 'M4', title: 'Launch video', status: 'todo' },
], decisions: [] })

test('a valid plan has no problems; the template is valid', () => {
  assert.deepEqual(problems(base()), [])
  assert.deepEqual(problems(JSON.parse(readFileSync(new URL('../docs/templates/PLAN.json', import.meta.url), 'utf8'))), [])
})

test('done needs evidence, wartet needs waits_on, drop needs why, ids unique, status known', () => {
  const p = base()
  p.items.push({ id: 'M1', title: 'dup', status: 'todo' }, { id: 'M5', title: 'x', status: 'done' }, { id: 'M6', title: 'y', status: 'wartet' }, { id: 'M7', title: 'z', status: 'drop' }, { id: 'M8', title: 'w', status: 'finished' })
  const out = problems(p).join('\n')
  for (const s of ['M1: id used twice', 'M5: done needs evidence', 'M6: wartet needs waits_on', 'M7: drop needs why', 'M8: status']) assert.match(out, new RegExp(s))
  assert.match(problems({ items: [] }).join('\n'), /goal/)
})

test('set and add return a new plan and never mutate the old one', () => {
  const p = base()
  const q = setItem(p, 'M2', { status: 'done', evidence: 'https://x/pull/2' }, '2026-11-13')
  assert.equal(p.items[1].status, 'doing')
  assert.equal(q.items[1].status, 'done')
  assert.equal(q.updated, '2026-11-13')
  assert.throws(() => setItem(p, 'M9', { status: 'doing' }), /no item M9/)
  assert.throws(() => setItem(p, 'M2', { status: 'done' }), /done needs evidence/)
  const r = addItem(p, { title: 'Ads', owner: 'Marketer' }, '2026-11-13')
  assert.equal(r.items.at(-1).id, 'M5')
  assert.equal(r.items.at(-1).status, 'todo')
})

test('stand answers in at most 10 lines: goal, count, doing, waits on him, next three', () => {
  const s = stand(base())
  assert.ok(s.split('\n').length <= 10, s)
  for (const want of ['Ship X', '1/4 done', 'M2', 'M3', 'his hands', 'M4']) assert.ok(s.includes(want), want)
})

test('cli: init starts an empty plan, add and stand work on it, no tmp file stays, a missing file says how to start', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'))
  const f = join(dir, 'PLAN.json')
  const cli = new URL('./plan.mjs', import.meta.url).pathname
  const run = (...a) => execFileSync('node', [cli, ...a, '--file', f], { encoding: 'utf8', stdio: 'pipe' })
  assert.throws(() => run('stand'), /init goal=/)
  run('init', 'goal=Ship Y')
  assert.throws(() => run('init', 'goal=again'), /exists/)
  assert.match(run('add', 'title=Build shop', 'owner=Programmer'), /0\/1 done/)
  assert.match(run('goal', 'Ship Y by Friday'), /Ship Y by Friday/)
  assert.match(run('stand'), /M1 Build shop/)
  assert.deepEqual(readdirSync(dir), ['PLAN.json'])
  assert.throws(() => run('set'), /needs an item id/)
  assert.throws(() => run('add', 'oops'), /not key=value/)
})

test('cli: set writes the file, check fails on a bad file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'))
  const f = join(dir, 'PLAN.json')
  writeFileSync(f, JSON.stringify(base()))
  const cli = new URL('./plan.mjs', import.meta.url).pathname
  execFileSync('node', [cli, 'set', 'M4', 'status=doing', 'owner=Producer · video', '--file', f])
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).items[3].status, 'doing')
  writeFileSync(f, JSON.stringify({ ...base(), items: [{ id: 'M1', title: 'x', status: 'done' }] }))
  assert.throws(() => execFileSync('node', [cli, 'check', '--file', f], { stdio: 'pipe' }), /done needs evidence/)
})

test('deps: unknown id, self-dep, dep on a dropped item and a cycle are problems; a clean chain is not', () => {
  const p = base()
  p.items[3] = { ...p.items[3], deps: 'M2' }
  assert.deepEqual(problems(p), [])
  const bad = (items) => problems({ goal: 'g', items: items.map((x) => ({ title: 't', status: 'todo', ...x })) }).join('\n')
  assert.match(bad([{ id: 'M1', deps: 'M9' }]), /M1: dep M9 does not exist/)
  assert.match(bad([{ id: 'M1', deps: 'M1' }]), /M1: depends on itself/)
  assert.match(bad([{ id: 'M1', deps: 'M2' }, { id: 'M2', status: 'drop', why: 'x' }]), /M1: dep M2 is dropped/)
  assert.match(bad([{ id: 'M1', deps: 'M2' }, { id: 'M2', deps: 'M3' }, { id: 'M3', deps: 'M1' }]), /cycle: M1 -> M2 -> M3 -> M1/)
})

test('deps: once a plan uses deps, an id or a range named in waits_on/next must be in deps; done items are ignored', () => {
  const bad = (items) => problems({ goal: 'g', items: items.map((x) => ({ title: 't', status: 'todo', ...x })) }).join('\n')
  const out = bad([{ id: 'M1', deps: 'M2', next: 'after M2-M4' }, { id: 'M2' }, { id: 'M3', status: 'done', evidence: 'x' }, { id: 'M4' }])
  assert.match(out, /M1: names M4 in waits_on\/next but not in deps/)
  assert.doesNotMatch(out, /names M3/)
  assert.deepEqual(problems({ goal: 'g', items: [{ id: 'M1', title: 't', status: 'todo', next: 'after M2' }, { id: 'M2', title: 't', status: 'todo' }] }), [])
})
