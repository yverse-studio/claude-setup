import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkAudio, checkDoc, REQUIRED_HEADINGS, PLACEHOLDER, AUDIO_FILE, AUDIO_CODE } from './audio-check.mjs'

const GOOD = `# Audio: Bug Garden
## Sound palette
| Moment | Sound | Length ms | Source (licence) | Variation |
|---|---|---|---|---|
| hit | soft thud | 80 | own synthesis | pitch +-6% |
| pickup | chime | 120 | Kenney Interface Sounds (CC0) | 3 takes |
## Music plan
Loop 64 s, loop point at bar 33. Two layers: calm, fight, faded in by enemy count above 20.
## Mix bar
Music -18 LUFS, sfx -14 LUFS, true peak -1 dBFS. Music ducks 6 dB for 200 ms on damage taken.
## Mute and settings
Music and sfx toggles on the title screen; muteAudio from the SDK wins.
## Autoplay and platform
The context resumes on the first tap. Silent during ads.
## File budget
Budget: 600 KB, OGG, mono sfx.
## Not this
- no voice-over
- no licensed tracks
## References
- A (https://www.crazygames.com/a, played 2026-10-18): hit, kill, pickup sound; 2 music layers; toggle on title. Copy: ducking. Skip: loud ad jingle.
- B (https://www.crazygames.com/b, played 2026-10-18): 4 sounds; one loop. Copy: pitch wobble. Skip: no mute.
- C (https://www.crazygames.com/c, played 2026-10-18): 6 sounds; silent menus. Copy: silence on death. Skip: repeating sting.
Not checked:
- Safari
`
const without = (re) => GOOD.replace(re, '')
const MANIFEST = { assets: [{ name: 'chime', path: 'assets/audio/chime.ogg', source: 'x', author: 'Kenney', licence: 'CC0', commercial: true }] }
const REPO = { doc: GOOD, files: [{ path: 'assets/audio/chime.ogg', bytes: 20 * 1024 }], manifest: MANIFEST, usesAudioCode: true }

test('a complete doc passes', () => assert.deepEqual(checkDoc(GOOD), []))
test('a complete repo passes', () => assert.deepEqual(checkAudio(REPO), []))
test('the shipped template fails until it is filled in', () => {
  const t = readFileSync(new URL('../../operator/templates/audio.md', import.meta.url), 'utf8')
  assert.ok(checkDoc(t).length > 0)
  for (const h of REQUIRED_HEADINGS) assert.ok(t.includes(`## ${h}`), h)
})
test('every placeholder the template carries is one the checker knows', () => {
  const t = readFileSync(new URL('../../operator/templates/audio.md', import.meta.url), 'utf8')
  assert.deepEqual(t.match(/<[^<>\n]+>/g), t.match(PLACEHOLDER))
})
test('a missing heading fails', () => assert.match(checkDoc(without(/## Mix bar\n.*\n/)).join(), /no "## Mix bar"/))
test('an empty section fails', () => assert.match(checkDoc(GOOD.replace(/## Mute and settings\n.*\n/, '## Mute and settings\n')).join(), /Mute and settings is empty/))
test('music, mix and budget without a number fail', () => {
  assert.match(checkDoc(GOOD.replace('Loop 64 s, loop point at bar 33. Two layers: calm, fight, faded in by enemy count above 20.', 'A loop with layers.')).join(), /Music plan has no number/)
  assert.match(checkDoc(GOOD.replace(/Music -18.*\n/, 'Balanced by ear.\n')).join(), /Mix bar has no number/)
})
test('a budget line is required', () => assert.match(checkDoc(GOOD.replace('Budget: 600 KB', 'small')).join(), /File budget: write "Budget/))
test('a palette table with no length fails', () => assert.match(checkDoc(GOOD.replace(/\| hit .*\n/, '| hit | thud | short | own synthesis | none |\n').replace(/\| pickup .*\n/, '')).join(), /Sound palette/))
test('fewer than two NOT lines fails', () => assert.match(checkDoc(without(/- no licensed tracks\n/)).join(), /Not this/))
test('fewer than three references fails', () => assert.match(checkDoc(without(/- C \(.*\n/)).join(), /2 of 3 games/))
test('a reference without a link, Copy, Skip or day fails', () => {
  assert.match(checkDoc(GOOD.replace('https://www.crazygames.com/a', 'crazygames')).join(), /without a link/)
  assert.match(checkDoc(GOOD.replace('Copy: ducking.', 'Take ducking.')).join(), /without "Copy:"/)
  assert.match(checkDoc(GOOD.replace('Skip: loud ad jingle', 'no jingle')).join(), /without "Skip:"/)
  assert.match(checkDoc(GOOD.replace(', played 2026-10-18): hit, kill', '): hit, kill')).join(), /without the day played/)
})
test('a left placeholder fails', () => assert.match(checkDoc(GOOD.replace('Bug Garden', '<name>')).join(), /placeholder/))
test('a doc without Not checked fails', () => assert.match(checkDoc(without(/Not checked:\n.*\n/)).join(), /Not checked/))
test('audio files without a doc fail', () => assert.match(checkAudio({ ...REPO, doc: null }).join(), /AUDIO\.md does not exist/))
test('sound made by code without a doc fails', () => assert.match(checkAudio({ doc: null, files: [], manifest: null, usesAudioCode: true }).join(), /AUDIO\.md does not exist/))
test('a file without a manifest row fails', () => assert.match(checkAudio({ ...REPO, files: [...REPO.files, { path: 'assets/audio/boom.wav', bytes: 1 }] }).join(), /boom\.wav: no assets\/manifest\.json row/))
test('a folder row covers its files', () => assert.deepEqual(checkAudio({ ...REPO, manifest: { assets: [{ ...MANIFEST.assets[0], path: 'assets/audio/' }] } }), []))
test('a licence that is not CC0, public domain or own synthesis fails', () => {
  for (const licence of ['CC BY-NC 4.0', 'free for personal use', 'all rights reserved', '', 'unknown']) {
    const manifest = { assets: [{ ...MANIFEST.assets[0], licence }] }
    assert.match(checkAudio({ ...REPO, manifest }).join(), /licence/, licence)
  }
})
test('a licence that only mentions an allowed one fails', () => {
  for (const licence of ['not CC0', 'CC0-NC', 'CC BY-NC 4.0 (not public domain)', 'CC0 (trust me)', 'ripped, own work']) {
    assert.match(checkAudio({ ...REPO, manifest: { assets: [{ ...MANIFEST.assets[0], licence }] } }).join(), /licence/, licence)
  }
})
test('a manifest row without source, author or commercial: true fails', () => {
  for (const k of ['source', 'author']) assert.match(checkAudio({ ...REPO, manifest: { assets: [{ ...MANIFEST.assets[0], [k]: '' }] } }).join(), /needs source, author/, k)
  assert.match(checkAudio({ ...REPO, manifest: { assets: [{ ...MANIFEST.assets[0], commercial: false }] } }).join(), /commercial: true/)
})
test('a budget of 0 KB does not switch the size check off', () => assert.match(checkDoc(GOOD.replace('Budget: 600 KB', 'Budget: 0 KB')).join(), /File budget: write "Budget/))
test('a palette number outside the Length column does not count', () => {
  const doc = GOOD.replace(/\| hit .*\n/, '| hit | thud | short | own synthesis | 3 takes |\n').replace(/\| pickup .*\n/, '')
  assert.match(checkDoc(doc).join(), /Length/)
})
test('audio over the doc budget fails', () => assert.match(checkAudio({ ...REPO, files: [{ path: 'assets/audio/chime.ogg', bytes: 601 * 1024 }] }).join(), /over the doc's budget of 600 KB/))

// pass-table (roles/reviewer.md): ordinary values must not fail
test('ordinary values pass: licences, paths, game text, CRLF, star bullets, bold labels', () => {
  for (const licence of ['CC0', 'CC0 1.0 Universal', 'cc0', 'Public Domain', 'own synthesis (jsfxr settings in design/sfx/)', 'Own work', ' CC0 ']) {
    assert.deepEqual(checkAudio({ ...REPO, manifest: { assets: [{ ...MANIFEST.assets[0], licence }] } }), [], licence)
  }
  const docs = [
    GOOD.replace('The context resumes', 'Press <kbd>M</kbd> to mute; the context resumes'),
    GOOD.replace('-18 LUFS', 'about -18 LUFS (<= -16)'),
    GOOD.replace(/\n/g, '\r\n'),
    GOOD.replace(/^- /gm, '* '),
    GOOD.replace(/Copy:/g, '**Copy:**').replace(/Skip:/g, '**Skip:**'),
    GOOD.replace('Budget: 600 KB', 'budget: 600 kb'),
  ]
  for (const doc of docs) assert.deepEqual(checkAudio({ ...REPO, doc }), [])
  const exactly = { ...REPO, files: [{ path: 'assets/audio/chime.ogg', bytes: 600 * 1024 }] }
  assert.deepEqual(checkAudio(exactly), [])
})
test('a repo with no sound at all passes', () => assert.deepEqual(checkAudio({ doc: null, files: [], manifest: null, usesAudioCode: false }), []))
test('the audio file and code patterns match ordinary names and miss look-alikes', () => {
  for (const f of ['a.ogg', 'sfx/Hit.MP3', 'x.wav', 'm.opus', 'a.weba', 'b.aiff', 'c.mid']) assert.ok(AUDIO_FILE.test(f), f)
  for (const f of ['audio.json', 'oggy.ts', 'a.ogg.map', 'notes.md']) assert.ok(!AUDIO_FILE.test(f), f)
  for (const c of ['new AudioContext()', 'const a = new Audio("x")', 'new Howl({})']) assert.ok(AUDIO_CODE.test(c), c)
  for (const c of ['audioContextName', 'AudioBuffer', 'const radio = 1']) assert.ok(!AUDIO_CODE.test(c), c)
})

const CLI = fileURLToPath(new URL('./audio-check.mjs', import.meta.url))
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'audio-'))
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), c) }
  return dir
}
test('the CLI exits 1 for a game with a sound file and no doc, 0 for a silent one, 0 for a complete one', () => {
  const noDoc = spawnSync('node', [CLI, repo({ 'assets/audio/a.ogg': 'x' })], { encoding: 'utf8' })
  assert.equal(noDoc.status, 1)
  assert.match(noDoc.stderr, /AUDIO\.md does not exist/)
  assert.equal(spawnSync('node', [CLI, repo({ 'src/main.ts': 'const x = 1' })], { encoding: 'utf8' }).status, 0)
  const ok = repo({ 'design/AUDIO.md': GOOD, 'assets/audio/chime.ogg': 'x', 'assets/manifest.json': JSON.stringify(MANIFEST) })
  assert.equal(spawnSync('node', [CLI, ok], { encoding: 'utf8' }).status, 0)
})
test('the CLI sees sound made by code and ignores node_modules', () => {
  assert.equal(spawnSync('node', [CLI, repo({ 'src/audio.ts': 'new AudioContext()' })], { encoding: 'utf8' }).status, 1)
  assert.equal(spawnSync('node', [CLI, repo({ 'node_modules/x/a.ogg': 'x' })], { encoding: 'utf8' }).status, 0)
})
