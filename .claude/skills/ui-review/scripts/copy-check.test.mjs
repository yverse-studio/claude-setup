import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCopy, REQUIRED_HEADINGS } from './copy-check.mjs'

const SCRIPT = fileURLToPath(new URL('./copy-check.mjs', import.meta.url))
const TEMPLATE = fileURLToPath(new URL('../../operator/templates/copy-deck.md', import.meta.url))
const deck = ({ voice = '- Eltern, die schnell etwas buchen wollen.\n- Ruhig, direkt, per Du.\n- Nie laut oder drängend.', terms = '| Warenkorb | Cart | Einkaufstasche, Korb |\n| Konto | Account | Profil |', strings = '| Button: primary action | Jetzt buchen | Book now |' } = {}) => `# Copy deck: Demo

## Voice
${voice}

## Terms
| Term DE | Term EN | Never |
|---|---|---|
${terms}

## Strings
| Where | DE | EN |
|---|---|---|
${strings}
`

test('a complete deck passes', () => assert.deepEqual(checkCopy(deck()), []))

test('each heading is required and must have content', () => {
  for (const h of REQUIRED_HEADINGS) {
    assert.ok(checkCopy(deck().replace(`## ${h}`, '## Other')).some((e) => e.includes(`no "## ${h}"`)), h)
  }
  assert.ok(checkCopy(deck({ voice: '' })).some((e) => e.includes('## Voice is empty')))
})

test('a voice with fewer than three lines fails', () => {
  assert.ok(checkCopy(deck({ voice: '- Eltern.\n- Ruhig.' })).some((e) => e.includes('Voice has 2')))
})

test('terms need two rows, each with both languages', () => {
  assert.ok(checkCopy(deck({ terms: '| Warenkorb | Cart | Korb |' })).some((e) => e.includes('Terms has 1')))
  assert.ok(checkCopy(deck({ terms: '| Warenkorb |  | Korb |\n| Konto | Account | |' })).some((e) => e.includes('Terms row 1')))
})

test('a string needs German and English, and not the same sentence twice', () => {
  assert.ok(checkCopy(deck({ strings: '| Empty state | Noch nichts da |  |' })).some((e) => e.includes('lacks a German or an English')))
  assert.ok(checkCopy(deck({ strings: '| Empty state | Nothing here yet | Nothing here yet |' })).some((e) => e.includes('same sentence')))
})

test('a term the Terms table rules out fails in either language', () => {
  assert.ok(checkCopy(deck({ strings: '| Hint | Dein Korb ist leer | Your cart is empty |' })).some((e) => e.includes('"Korb"')))
  assert.deepEqual(checkCopy(deck({ strings: '| Hint | Dein Warenkorb ist leer | Your cart is empty, see your profile |' })), []) // "Profil" is ruled out, "profile" is another word
})

test('promo words fail in German and English, whole words only', () => {
  assert.ok(checkCopy(deck({ strings: '| Hero | Nahtlos buchen | Unlock your day |' })).length === 2)
  assert.deepEqual(checkCopy(deck({ strings: '| Hint | Unlocked-Keys sind nicht gemeint | Seamlessness is not here |' })), [])
})

test('"not just X" fails in both languages', () => {
  assert.ok(checkCopy(deck({ strings: '| Hero | Nicht nur ein Kalender | Not just a calendar |' })).length === 2)
})

test('button labels: vague or longer than four words fail, ordinary ones pass', () => {
  const bad = (s) => checkCopy(deck({ strings: s })).length
  assert.equal(bad('| Button: send | Absenden | Submit |'), 2)
  assert.equal(bad('| Button: send | Jetzt den Termin für morgen buchen | Book it |'), 1)
  for (const [de, en] of [['Speichern', 'Save'], ['Anmelden', 'Log in'], ['Passwort vergessen?', 'Forgot password?'], ['Jetzt kostenlos testen', 'Try it free'], ['Weiter', 'Continue']]) {
    assert.equal(bad(`| Button: x | ${de} | ${en} |`), 0, de)
  }
})

test('a long text outside a button is not limited', () => {
  assert.deepEqual(checkCopy(deck({ strings: '| Error | Das Speichern hat nicht geklappt. Prüfe deine Verbindung und versuche es noch einmal. | Saving failed. Check your connection and try again. |' })), [])
})

test('the template itself fails on its placeholders and keeps every heading', () => {
  const tpl = readFileSync(TEMPLATE, 'utf8')
  for (const h of REQUIRED_HEADINGS) assert.match(tpl, new RegExp(`^## ${h}\\s*$`, 'm'))
  assert.ok(checkCopy(tpl).some((e) => e.includes('template placeholder left')))
})

test('the command exits 1 on a bad deck and 0 on a good one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'copy-'))
  writeFileSync(join(dir, 'good.md'), deck())
  writeFileSync(join(dir, 'bad.md'), deck({ strings: '| Hero | Nahtlos | Seamless |' }))
  assert.equal(spawnSync('node', [SCRIPT, join(dir, 'good.md')]).status, 0)
  assert.equal(spawnSync('node', [SCRIPT, join(dir, 'bad.md')]).status, 1)
  assert.equal(spawnSync('node', [SCRIPT, join(dir, 'missing.md')]).status, 1)
})

test('a deck with a "Languages: en" line is English only: terms are term | never, strings are where | text', () => {
  const en = `# Copy deck: Demo

Languages: en

## Voice
- Parents who book fast.
- Calm, direct.
- Never loud.

## Terms
| Term | Never |
|---|---|
| cart | basket, bag |
| account | profile |

## Strings
| Where | Text |
|---|---|
| Button: primary action | Book now |
| Empty state | Your cart is empty. |
`
  assert.deepEqual(checkCopy(en), [])
  assert.ok(checkCopy(en.replace('Book now', 'Add a basket')).some((e) => /rules out/.test(e)))
  assert.ok(checkCopy(en.replace('Book now', 'Unlock savings')).some((e) => /promo word/.test(e)))
  assert.ok(checkCopy(en.replace('Languages: en\n', '')).some((e) => /lacks a German or an English/.test(e)))
})
