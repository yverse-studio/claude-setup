// F1 #613: the lines the LESSONS-INBOX blocks ended in. Run: node --test scripts/lessons-f1.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('pc-claude-user.md: the RC allow card is accepted only on the laptop, and an offline device call is said in the thread', () => {
  const t = read('docs/pc-claude-user.md')
  assert.match(t, /Remote Control allow card can be accepted only in the desktop app on the laptop/)
  assert.match(t, /"waits for the laptop"/)
  assert.match(t, /fails with "offline" is the same: the thread says so in its own thread the same turn and messages the coordinator once/)
})

test('researcher.md names the watch skill for a video link, and its Uses: line is untouched', () => {
  const t = read('.claude/skills/operator/roles/researcher.md')
  assert.match(t, /^6\. \*\*A video or social link\*\*.*`watch` skill.*before any "cannot view"/m)
  assert.equal((t.match(/^Uses:.*$/m) ?? [''])[0].includes('watch'), false)
})

test('renpy.md: one line for the rotated button and the eol=lf .gitattributes', () => {
  const t = read('docs/renpy.md')
  const line = t.split('\n').find((l) => /rotated button/.test(l)) ?? ''
  assert.match(line, /`\* text=auto eol=lf`/)
  assert.match(line, /CRLF `\.renpy-version` breaks `check\.sh`/)
})
