// The Luna HQ panel (.opencode/plugins/hq): budget math, spend ranges, open-items digest. Run: node --test scripts/opencode-hq.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { withPlugin } from './hq-panel-install.mjs'
import { LOW_USD, creditState, lines, parseBudget, parseOpenItems, ranges, remaining, snapshot, view } from '../.opencode/plugins/hq/status.mjs'

const OPEN = `# Was ist offen (Stand 2026-10-28 23:35)

## ceo-Aufträge
- keine

## Offene PRs (23)
- claude-setup#317 feat: Blender laptop jobs
- claude-setup#321 feat: threads hand off
- … 11 weitere in der HTML-Seite

## Jobs (0)
- keine

## Projekte
- **claude-setup-luna2** (main)
`

test('budget file: valid input, and null for anything unusable (shows "unknown, enter top-up")', () => {
  const b = parseBudget('{"topup_usd": 50, "since": "2026-10-28"}')
  assert.equal(b.topup, 50)
  assert.equal(b.sinceMs, new Date(2026, 9, 28).getTime())
  assert.equal(parseBudget('\uFEFF{"topup_usd": "12.5", "since": "2026-01-02"}').topup, 12.5)
  const stamped = parseBudget('{"topup_usd": 153.75, "since": "2026-10-28T23:59:00+01:00", "note": "read in the Console"}')
  assert.equal(stamped.topup, 153.75)
  assert.equal(stamped.sinceMs, Date.parse('2026-10-28T22:59:00Z'))
  assert.match(stamped.since, /^2026-10-2[89] \d\d:\d\d$/)
  for (const bad of ['{"topup_usd": 5, "since": "2026-10-28T25:00:00"}', null, '', 'nope', '{}', '{"topup_usd": 0, "since": "2026-10-28"}', '{"topup_usd": 50}', '{"topup_usd": 50, "since": "28.10.2026"}', '{"topup_usd": 50, "since": "2026-02-31"}', '{"topup_usd": -5, "since": "2026-10-28"}'])
    assert.equal(parseBudget(bad), null, String(bad))
})

test('remaining credit = top-up minus the cost since the date, rounded to cents', () => {
  const b = parseBudget('{"topup_usd": 50, "since": "2026-10-28"}')
  assert.equal(remaining(b, 29.397103880000007), 20.6)
  assert.equal(remaining(b, 0), 50)
  assert.equal(remaining(b, 60), -10)
  assert.equal(remaining(null, 3), null)
  assert.equal(remaining(b, null), null)
})

test('credit state: ok, low under the limit, over below zero, unknown without a number', () => {
  assert.equal(creditState(LOW_USD), 'ok')
  assert.equal(creditState(LOW_USD - 0.01), 'low')
  assert.equal(creditState(0), 'low')
  assert.equal(creditState(-0.01), 'over')
  assert.equal(creditState(null), 'unknown')
})

test('ranges: today and Monday of this week at local midnight', () => {
  const wed = ranges(new Date(2026, 9, 28, 23, 59))
  assert.equal(wed.today, new Date(2026, 9, 28).getTime())
  assert.equal(wed.week, new Date(2026, 9, 26).getTime())
  const mon = ranges(new Date(2026, 9, 26, 0, 1))
  assert.equal(mon.today, mon.week)
  const sun = ranges(new Date(2026, 9, 25, 12))
  assert.equal(sun.week, new Date(2026, 9, 19).getTime())
  assert.equal(ranges(new Date(2026, 10, 1, 8)).week, new Date(2026, 9, 26).getTime())
})

test('open items: Stand time, counts from the headings, "keine" is not an item, stale after an hour', () => {
  const fresh = parseOpenItems(OPEN, new Date(2026, 9, 28, 23, 50))
  assert.equal(fresh.stand, '2026-10-28 23:35')
  assert.equal(fresh.stale, false)
  assert.deepEqual(fresh.sections.map((s) => [s.title, s.count, s.items.length]), [['ceo-Aufträge', 0, 0], ['Offene PRs', 23, 3], ['Jobs', 0, 0], ['Projekte', 1, 1]])
  assert.equal(parseOpenItems(OPEN, new Date(2026, 9, 29, 0, 36)).stale, true)
  assert.equal(parseOpenItems('# no stand here\n## A\n- x', new Date()).stale, true)
  assert.equal(parseOpenItems('  ', new Date()), null)
  assert.equal(parseOpenItems(null, new Date()), null)
})

test('lines: credit, spend and open items; missing pieces say so instead of inventing numbers', () => {
  const now = new Date(2026, 9, 28, 23, 50)
  const open = parseOpenItems(OPEN, now)
  const b = parseBudget('{"topup_usd": 50, "since": "2026-10-28"}')
  const ok = lines(snapshot({ budget: b, spent: { today: 2.5, week: 29.7, since: 29.4 }, open, now }))
  assert.equal(ok[0], 'Guthaben: $20.60 von $50.00 seit 2026-10-28')
  assert.equal(ok[1], 'Ausgaben: heute $2.50, Woche $29.70')
  assert.equal(ok[2], 'Offen (Stand 2026-10-28 23:35): ceo-Aufträge 0, Offene PRs 23, Jobs 0')

  const none = lines(snapshot({ budget: null, spent: { today: 1, week: 2, since: null }, open: null, now }))
  assert.match(none[0], /unbekannt, Aufladung eintragen/)
  assert.match(none[2], /open-items\.md fehlt/)

  const blind = snapshot({ budget: b, spent: { today: null, week: null, since: null }, open, now })
  assert.equal(blind.credit.state, 'unchecked')
  assert.match(lines(blind)[0], /nicht geprüft/)
  assert.match(lines(blind)[1], /heute \?, Woche \?/)

  const low = lines(snapshot({ budget: b, spent: { today: 0, week: 0, since: 47 }, open, now }))[0]
  assert.match(low, /\$3\.00 von \$50\.00.*\(wenig\)/)
})

test('view carries the state, the lines and the open items in full for the tooltip', () => {
  const now = new Date(2026, 9, 28, 23, 50)
  const v = view(snapshot({ budget: null, spent: { today: 0, week: 0, since: null }, open: parseOpenItems(OPEN, now), now }))
  assert.equal(v.state, 'unknown')
  assert.equal(v.lines.length, 3)
  assert.match(v.tip, /^ceo-Aufträge \(0\)\nOffene PRs \(23\)\n- claude-setup#317/)
  assert.equal(view(snapshot({ budget: null, spent: null, open: null })).tip, '')
})

test('collect reads the budget file and open-items.md from the home folder and takes the cost from the injected source', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hq-'))
  mkdirSync(join(home, '.config', 'opencode'), { recursive: true })
  mkdirSync(join(home, '.claude'), { recursive: true })
  writeFileSync(join(home, '.config', 'opencode', 'luna-budget.json'), '{"topup_usd": 10, "since": "2026-10-20"}')
  writeFileSync(join(home, '.claude', 'open-items.md'), OPEN)
  const was = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME }
  process.env.USERPROFILE = process.env.HOME = home
  try {
    const { collect } = await import('../.opencode/plugins/hq/collect.mjs')
    const asked = []
    const s = await collect({ now: new Date(2026, 9, 28, 23, 50), refresh: false, cost: async (from) => { asked.push(from); return from === new Date(2026, 9, 20).getTime() ? 4 : 1 } })
    assert.equal(s.credit.left, 6)
    assert.deepEqual(s.spent, { today: 1, week: 1, since: 4 })
    assert.deepEqual(asked.sort(), [new Date(2026, 9, 20).getTime(), new Date(2026, 9, 26).getTime(), new Date(2026, 9, 28).getTime()].sort())
    assert.equal(s.open.sections[1].count, 23)
  } finally {
    for (const [k, v] of Object.entries(was)) v === undefined ? delete process.env[k] : (process.env[k] = v)
  }
})

test('hq-panel-install adds the plugin folder once, keeps other entries and keys, and can remove it again', () => {
  const dir = join(tmpdir(), 'clone', '.opencode', 'plugins', 'hq')
  const config = { model: 'x', plugins: ['other-plugin'] }
  const once = withPlugin(config, dir)
  assert.deepEqual(once, { model: 'x', plugins: ['other-plugin', dir] })
  assert.deepEqual(withPlugin(once, dir), once)
  assert.deepEqual(withPlugin(once, dir, true), config)
  assert.deepEqual(withPlugin({ plugins: ['C:\\old clone\\.opencode\\plugins\\hq', 'other-plugin'] }, dir), { plugins: ['other-plugin', dir] }) // path-lint: fixture
  assert.deepEqual(withPlugin({ model: 'x' }, dir, true), { model: 'x' })
  assert.deepEqual(withPlugin({ plugins: [dir] }, dir, true), {})
  assert.deepEqual(config, { model: 'x', plugins: ['other-plugin'] })
})

test('the plugin never reads or stores a key', () => {
  for (const f of ['collect.mjs', 'index.js', 'status.mjs', 'gui-experimental.cjs'])
    assert.doesNotMatch(readFileSync(new URL(`../.opencode/plugins/hq/${f}`, import.meta.url), 'utf8'), /auth\.json|api[_-]?key|service\.json|password|ANTHROPIC_API_KEY/i, f)
})
