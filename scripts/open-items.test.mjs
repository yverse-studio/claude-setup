// Parsing of the `## Jetzt` block and the Markdown overview (no network, no git).
// Run: node --test scripts/open-items.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { daysSince, extractJetzt, jobTitle, toHtml, toMarkdown } from './open-items.mjs'

const progress = `# x: progress

## Jetzt
Ziel: Geld verdienen mit duo-test.
Offen:
- Stripe live schalten
- Impressum
Wartet auf dich:
- Gewerbe anmelden.
Stand: 2026-10-27

## Später
Ziel: nicht dieses
`

test('extracts Ziel, Offen, Wartet and Stand and stops at the next heading', () => {
  const j = extractJetzt(progress)
  assert.equal(j.ziel, 'Geld verdienen mit duo-test.')
  assert.deepEqual(j.offen, ['Stripe live schalten', 'Impressum'])
  assert.deepEqual(j.wartet, ['Gewerbe anmelden.'])
  assert.equal(j.stand, '2026-10-27')
  assert.equal(j.money, true)
})

test('handles CRLF and a BOM', () => {
  const j = extractJetzt('\uFEFF' + progress.replace(/\n/g, '\r\n'))
  assert.equal(j.stand, '2026-10-27')
  assert.equal(j.offen.length, 2)
})

test('"nichts" under Wartet auf dich is empty; no Jetzt block gives null', () => {
  const j = extractJetzt('## Jetzt\nZiel: a\nOffen:\n- b\nWartet auf dich:\n- nichts\nStand: 2026-10-01\n')
  assert.deepEqual(j.wartet, [])
  assert.equal(j.money, false)
  assert.equal(extractJetzt('# Progress\n\nDone: a\n'), null)
  assert.equal(extractJetzt(undefined), null)
})

test('daysSince and jobTitle', () => {
  assert.equal(daysSince('2026-10-27', new Date('2026-10-28T12:00:00Z')), 1)
  assert.equal(daysSince('?'), null)
  assert.equal(jobTitle('\n# Fix the thing\nbody'), 'Fix the thing')
})

const repos = [
  { name: 'a', branch: 'main', changes: 0, jetzt: extractJetzt('## Jetzt\nZiel: ruhig\nOffen:\n- x\nWartet auf dich:\n- nichts\nStand: 2026-10-27'), label: '' },
  { name: 'duo-test', branch: 'main', changes: 2, jetzt: extractJetzt(progress), label: '' },
  { name: 'b', branch: 'dev', changes: 1, jetzt: null, label: '' },
]

test('Markdown puts money first, names waiting items, stays under 60 lines and says when gh failed', () => {
  const md = toMarkdown({ at: new Date('2026-10-28T10:00:00Z'), repos, prs: null, issues: null, jobs: [] })
  assert.ok(md.indexOf('## Geld zuerst') < md.indexOf('## Wartet auf dich'))
  assert.match(md, /duo-test\*\*: Geld verdienen/)
  assert.match(md, /nicht geprüft \(gh fehlgeschlagen\)/)
  assert.match(md, /Ohne Jetzt-Block: b \(dev, 1±\)/)
  assert.ok(md.trim().split('\n').length <= 60)
})

test('Markdown cuts long PR lists and the HTML escapes titles', () => {
  const prs = Array.from({ length: 30 }, (_, i) => ({ repository: { name: 'r' }, number: i, title: '<b>x</b>', url: 'https://github.com/o/r/pull/' + i, isDraft: i % 2 === 0, updatedAt: '2026-10-28' }))
  const data = { at: new Date(), repos, prs, issues: [], jobs: [{ file: 'j.md', title: 'Job & Co' }] }
  assert.ok(toMarkdown(data).trim().split('\n').length <= 60)
  const html = toHtml(data)
  assert.ok(!html.includes('<b>x</b>'))
  assert.match(html, /http-equiv="refresh" content="300"/)
  assert.match(html, /Job &amp; Co/)
})
