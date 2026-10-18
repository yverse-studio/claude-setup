import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkTracking, checkNumbersLine, checkRoleDoc, eventNameErrors, REQUIRED_HEADINGS, MAX_EVENTS, PLACEHOLDER } from './analytics-check.mjs'

const SCRIPT = fileURLToPath(new URL('./analytics-check.mjs', import.meta.url))
const ROLE = fileURLToPath(new URL('../../operator/roles/analytics.md', import.meta.url))
const TEMPLATE = fileURLToPath(new URL('../../operator/templates/tracking-plan.md', import.meta.url))
const row = (name = 'Checkout Started', metric = 'paying', basis = 'cookieless: no personal data', props = 'plan, price_eur') => `| ${name} | Do visitors start paying? | ${metric} | ${basis} | ${props} |`
const plan = ({ objectives = '- Sell the pro plan; moves paying.', events = [row(), row('Order Paid', 'revenueMonth')], privacy = '- Tool: Umami\n- Banner: nein' } = {}) => `# Tracking plan: Demo

## Objectives
${objectives}

## Events
| Event | Question it answers | Money metric | Basis | Properties |
|---|---|---|---|---|
${events.join('\n')}

## Privacy
${privacy}
`

test('a complete plan passes', () => assert.deepEqual(checkTracking(plan()), []))

test('each heading is required and must have content', () => {
  for (const h of REQUIRED_HEADINGS) {
    assert.ok(checkTracking(plan().replace(`## ${h}`, '## Other')).some((e) => e.includes(`no "## ${h}"`)), h)
  }
  assert.ok(checkTracking(plan({ privacy: '' })).some((e) => e.includes('## Privacy is empty')))
  assert.ok(checkTracking(plan({ objectives: 'prose, no bullet' })).some((e) => e.includes('no bullet')))
})

test('ordinary event names pass (pass-table)', () => {
  for (const n of ['Checkout Started', 'Order Paid', 'Waitlist Joined', 'Signup Completed', 'Game Started', 'Ad Shown', 'Level Reached', 'Run Ended', 'Revive Accepted', 'Share Clicked', 'Email Submitted', 'Name Changed', 'Newsletter Subscribed', 'Cart Abandoned'])
    assert.deepEqual(eventNameErrors(n), [], n)
})

test('each event-name rule fails on its own violation', () => {
  const fails = { 'signup_click': 'one word', 'Signup': 'one word', 'checkout started': 'Title Case', 'CheckoutStarted': 'Title Case', 'User Signed Up (11-01-2019)': 'dynamic', 'Page View 2026-10-18': 'dynamic', 'Level 3 Reached': 'dynamic', 'Order Payment': 'past-tense', 'Click Button': 'past-tense' }
  for (const [name, part] of Object.entries(fails)) assert.ok(eventNameErrors(name).some((e) => e.includes(part)), name)
})

test('duplicate names, a missing cell and too many events fail', () => {
  assert.ok(checkTracking(plan({ events: [row(), row()] })).some((e) => e.includes('duplicate')))
  assert.ok(checkTracking(plan({ events: ['| Checkout Started | | paying | cookieless | |'] })).some((e) => e.includes('lacks a name')))
  const many = Array.from({ length: MAX_EVENTS + 1 }, (_, i) => row(`Item ${'Abcdefghijklmnop'[i]}ed`))
  assert.ok(checkTracking(plan({ events: many })).some((e) => e.includes('max')))
})

test('money metric must be an HQ field', () => {
  assert.ok(checkTracking(plan({ events: [row('Checkout Started', 'conversion')] })).some((e) => e.includes('money metric')))
  for (const m of ['visitors7d', 'signups', 'paying', 'revenueMonth']) assert.deepEqual(checkTracking(plan({ events: [row('Checkout Started', m)] })), [], m)
})

test('properties must be snake_case without dynamic keys', () => {
  assert.ok(checkTracking(plan({ events: [row('Checkout Started', 'paying', 'cookieless', 'feature_1')] })).some((e) => e.includes('snake_case')))
  assert.ok(checkTracking(plan({ events: [row('Checkout Started', 'paying', 'cookieless', 'PlanName')] })).some((e) => e.includes('snake_case')))
  assert.deepEqual(checkTracking(plan({ events: [row('Checkout Started', 'paying', 'cookieless', 'plan, price_eur, ad_slot')] })), [])
})

test('basis must be cookieless or consent and agree with the banner', () => {
  assert.ok(checkTracking(plan({ events: [row('Checkout Started', 'paying', 'legitimate')] })).some((e) => e.includes('basis must start')))
  const consent = row('Pixel Fired', 'visitors7d', 'consent: Meta pixel, § 25 TDDDG')
  assert.ok(checkTracking(plan({ events: [consent] })).some((e) => e.includes('Banner: nein')))
  assert.deepEqual(checkTracking(plan({ events: [consent], privacy: '- Tool: Meta pixel\n- Banner: ja' })), [])
  assert.ok(checkTracking(plan({ privacy: '- Tool: Umami\n- Banner: ja' })).some((e) => e.includes('drop the banner')))
  assert.ok(checkTracking(plan({ privacy: '- Banner: nein' })).some((e) => e.includes('Tool:')))
  assert.ok(checkTracking(plan({ privacy: '- Tool: Umami' })).some((e) => e.includes('Banner:')))
})

const line = 'duo-test KW42 | Besucher 7d: 120 | Anmeldungen: 4 | Zahlende: 1 | Umsatz: 9,00 € live | Quelle: Umami, gelesen 2026-10-19T08:00Z'

test('a numbers line with read values passes', () => {
  assert.deepEqual(checkNumbersLine(line), [])
  assert.deepEqual(checkNumbersLine(line.replace('120', 'nicht gelesen').replace('9,00 € live', '0 € Testgeld')), [])
  assert.deepEqual(checkNumbersLine(line.replace('120', '1.250')), [])
})

const estimateErrors = (l) => checkNumbersLine(l).filter((e) => e.includes('estimate'))

test('each estimate word or sign fails on its own', () => {
  for (const bad of ['~120', '≈120', 'ca. 120', 'circa 120', 'about 120', 'approx. 120', 'approximately 120', 'etwa 120', 'ungefähr 120', 'geschätzt 120'])
    assert.equal(estimateErrors(line.replace('120', bad)).length, 1, bad)
  assert.equal(estimateErrors(line.replace('Umami,', 'Umami (Schätzung),')).length, 1, 'schätz in the source')
})

test('the words analytics.md names are all rejected', () => {
  const rule = readFileSync(ROLE, 'utf8').match(/`~`, `ca\.`, "about" and "etwa"/)
  assert.ok(rule, 'the role no longer names ~, ca., about and etwa')
  for (const bad of ['~', 'ca.', 'about', 'etwa']) assert.equal(estimateErrors(line.replace('120', `${bad} 120`)).length, 1, bad)
})

test('ordinary lines are not taken for estimates (pass-table)', () => {
  for (const ok of [line, line.replace('duo-test', 'aboutme'), line.replace('duo-test', 'etwas-app'), line.replace('duo-test', 'circadian'), line.replace('duo-test', 'ca-game'), line.replace('Umami', 'Own count in D1'), line.replace('Umami', 'Cloudflare Web Analytics'), line.replace('120', '1.250').replace('9,00 € live', '0 € Testgeld')])
    assert.deepEqual(checkNumbersLine(ok), [], ok)
})

test('a numbers line fails on missing fields and a missing source', () => {
  assert.ok(checkNumbersLine(line.replace('Anmeldungen: 4 | ', '')).some((e) => e.includes('Anmeldungen')))
  assert.ok(checkNumbersLine(line.replace(/ \| Quelle.*/, '')).some((e) => e.includes('Quelle')))
  assert.ok(checkNumbersLine(line.replace('KW42', 'Woche 42')).some((e) => e.includes('KW')))
  assert.ok(checkNumbersLine(line.replace('120', 'viele')).some((e) => e.includes('neither a number')))
})

test('the shipped template fails on its placeholders and carries every heading', () => {
  const t = readFileSync(TEMPLATE, 'utf8')
  assert.ok(checkTracking(t).some((e) => e.includes('placeholder')))
  for (const h of REQUIRED_HEADINGS) assert.match(t, new RegExp(`^## ${h}\\s*$`, 'm'))
})

test('every placeholder in the template is one the checker knows, and each known one is in the template', () => {
  const t = readFileSync(TEMPLATE, 'utf8')
  const known = new Set([...t.matchAll(PLACEHOLDER)].map((m) => m[0]))
  for (const m of t.matchAll(/<[^>\n]+>/g)) assert.ok(known.has(m[0]), `${m[0]} would pass the checker unnoticed`)
  for (const alt of PLACEHOLDER.source.match(/\(\?:(.*)\)/)[1].split('|')) assert.ok(t.includes(`<${alt.replace(/\\/g, '')}>`), `<${alt}> left the template`)
})

test('the Banner placeholder of the template fails and a filled one passes', () => {
  const t = readFileSync(TEMPLATE, 'utf8')
  assert.ok(checkTracking(t).includes('template placeholder left: <ja/nein>'))
  assert.ok(!checkTracking(t.replace('<ja/nein>', 'nein')).includes('template placeholder left: <ja/nein>'))
})

const roleDoc = readFileSync(ROLE, 'utf8')

test('the shipped role doc passes its own guard', () => assert.deepEqual(checkRoleDoc(roleDoc), []))

test('a Tools row without a source or with a wrong cell count fails', () => {
  const row = roleDoc.split('\n').find((l) => l.startsWith('| Umami Cloud'))
  const cells = row.split('|')
  const noSource = roleDoc.replace(row, cells.slice(0, 5).join('|') + '| |')
  assert.ok(checkRoleDoc(noSource).some((e) => e.includes('Umami Cloud') && e.includes('no source')))
  assert.ok(checkRoleDoc(roleDoc.replace(row, cells.slice(0, 5).join('|') + '| see their site |')).some((e) => e.includes('no source')))
  assert.ok(checkRoleDoc(roleDoc.replace(row, row.replace(/\|[^|]*\|$/, '|'))).some((e) => e.includes('cells')))
  assert.ok(checkRoleDoc(roleDoc.replace(/^## Tools$/m, '## Other')).some((e) => e.includes('no row')))
})

test('the legal-reviewer check must stay in Method and Bar', () => {
  assert.ok(checkRoleDoc(roleDoc.replace(/legal-reviewer/g, 'x')).filter((e) => e.includes('legal-reviewer')).length === 2)
  const noBar = roleDoc.replace(/(## Bar[\s\S]*)/, (b) => b.replace(/legal-reviewer/g, 'x'))
  assert.deepEqual(checkRoleDoc(noBar).filter((e) => e.includes('legal-reviewer')), ['roles/analytics.md: ## Bar lost the legal-reviewer check'])
})

test('the CLI exits 1 on a failing plan, 0 on a passing one, 1 on a missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'analytics-'))
  const bad = join(dir, 'bad.md'), good = join(dir, 'good.md')
  writeFileSync(bad, plan({ events: [row('signup_click')] }))
  writeFileSync(good, plan())
  assert.equal(spawnSync('node', [SCRIPT, bad]).status, 1)
  assert.equal(spawnSync('node', [SCRIPT, good]).status, 0)
  assert.equal(spawnSync('node', [SCRIPT, join(dir, 'none.md')]).status, 1)
})
