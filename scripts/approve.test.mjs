// GameDev 2026-11-15 (#697, #703): an owner-picked sheet was moved in a cleanup and nothing proved the picture was still there.
// Each test was red before scripts/approve.mjs existed; every RED rule of `check` is fed its own violation.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { approvalProblems, check, listAll, lock, main, parseIndex, thingFolders } from './approve.mjs'

const MSG = 'https://claude.ai/code/card/abc'
const HEAD = '| File | Decision | Date | Source |\n|---|---|---|---|\n'
const cli = (...args) => spawnSync('node', [fileURLToPath(new URL('./approve.mjs', import.meta.url)), ...args], { encoding: 'utf8' })
// A studio root with one character folder: lib/characters/CH_x, an options sheet outside it, and a plan beside lib/.
function studio() {
  const root = mkdtempSync(join(tmpdir(), 'approve-'))
  const dir = join(root, 'lib', 'characters', 'CH_x')
  mkdirSync(join(root, 'votes'), { recursive: true }); mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, 'votes', 'A.png'), 'png-a')
  writeFileSync(join(root, 'PLAN.json'), JSON.stringify({ goal: 'G', updated: '2026-11-15', items: [{ id: 'M1', title: 'Face', status: 'doing' }], decisions: [] }))
  const pick = (extra = {}) => ({ dir, image: join(root, 'votes', 'A.png'), decision: 'option A, the calm one', source: 'votes/round-1', msg: MSG, today: '2026-11-16', ...extra })
  return { root, dir, pick, read: (...p) => readFileSync(join(dir, ...p), 'utf8'), put: (p, text) => { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), text) }, done: () => rmSync(root, { recursive: true, force: true }) }
}
// A clean hand-made folder: one picture, its row, its DECISIONS.md line.
function clean(s, row = '| A.png | option A | 2026-11-15 | votes/round-1; card |') {
  s.put('approval/A.png', 'x'); s.put('approval/INDEX.md', `${HEAD}${row}\n`); s.put('DECISIONS.md', '- 2026-11-15 option A: `approval/A.png`, card\n')
}

test('lock copies the picture, writes the row and DECISIONS.md line and the item\'s target_image; check is green', () => {
  const s = studio()
  try {
    const r = lock(s.pick({ item: 'M1', plan: join(s.root, 'PLAN.json') }))
    assert.equal(s.read('approval', 'A.png'), 'png-a')
    assert.equal(s.read('approval', 'INDEX.md'), `${HEAD}| A.png | option A, the calm one | 2026-11-16 | votes/round-1; ${MSG} |\n`)
    assert.match(s.read('DECISIONS.md'), /^- 2026-11-16 option A, the calm one: `approval\/A\.png`, https:/)
    assert.equal(r.target_image, 'lib/characters/CH_x/approval/A.png')
    assert.equal(JSON.parse(readFileSync(join(s.root, 'PLAN.json'), 'utf8')).items[0].target_image, 'lib/characters/CH_x/approval/A.png')
    assert.deepEqual(approvalProblems(s.dir, s.root), { red: [], warn: [], pictures: 1, folder: true })
    const out = cli('check', '--all', s.root)
    assert.equal(out.status, 0); assert.match(out.stdout, /^OK approval: 1 folder\(s\), 1 picture\(s\), 0 warning\(s\)$/m)
  } finally { s.done() }
})

test('lock with neither --msg nor --on exits 2 and writes nothing; --on carries the imported text and its date', () => {
  const s = studio()
  try {
    const base = ['lock', '--dir', s.dir, '--image', join(s.root, 'votes', 'A.png'), '--decision', 'option A', '--source', 'votes/round-1']
    const no = cli(...base)
    assert.equal(no.status, 2); assert.match(no.stderr, /--msg[^\n]*--on/); assert.equal(existsSync(join(s.dir, 'approval')), false)
    assert.equal(cli(...base, '--msg', 'he said yes').status, 2, 'words are no message link')
    assert.equal(cli(...base, '--on', 'last week').status, 2)
    assert.equal(cli(...base, '--item', 'M1', '--msg', MSG).status, 2, '--item needs --plan')
    const on = '2026-11-10 14:05, imported from reference/INDEX.md'
    assert.equal(cli(...base, '--on', on).status, 0)
    assert.equal(s.read('approval', 'INDEX.md'), `${HEAD}| A.png | option A | 2026-11-10 | votes/round-1; ${on} |\n`)
    assert.equal(cli('check', s.dir).status, 0)
  } finally { s.done() }
})

test('lock refuses to overwrite a picture, and a bad item id leaves no half lock', () => {
  const s = studio()
  try {
    assert.throws(() => lock(s.pick({ item: 'M9', plan: join(s.root, 'PLAN.json') })), /no item M9/)
    assert.equal(existsSync(join(s.dir, 'approval')), false)
    lock(s.pick())
    const index = s.read('approval', 'INDEX.md')
    assert.throws(() => lock(s.pick({ decision: 'another' })), /exists; a new pick gets a new name[^\n]*supersede/)
    assert.equal(s.read('approval', 'INDEX.md'), index)
    assert.equal(main(['lock', '--dir', s.dir, '--image', join(s.root, 'votes', 'A.png'), '--decision', 'x', '--source', 'y', '--msg', MSG], () => {}, () => {}), 1)
    lock(s.pick({ name: 'B.png', decision: 'B | the bold one' }))
    assert.equal(parseIndex(s.read('approval', 'INDEX.md')).rows[1].decision, 'B | the bold one', 'a pipe in his words stays one cell')
    assert.throws(() => lock(s.pick({ name: 'my pick.png' })), /no picture name/)
  } finally { s.done() }
})

test('lock appends a row that fits an existing header: Image first or last, extra columns left empty', () => {
  const s = studio()
  try {
    s.put('approval/INDEX.md', '# Approved\n\n| Date | Image | By | Decision | Source |\n|---|---|---|---|---|\n\nNotes below the table stay below.\n')
    lock(s.pick())
    assert.equal(s.read('approval', 'INDEX.md'), `# Approved\n\n| Date | Image | By | Decision | Source |\n|---|---|---|---|---|\n| 2026-11-16 | A.png |  | option A, the calm one | votes/round-1; ${MSG} |\n\nNotes below the table stay below.\n`)
    assert.deepEqual(approvalProblems(s.dir).red, [])
  } finally { s.done() }
})

test('supersede moves the picture to approval/_superseded/ and check stays green', () => {
  const s = studio()
  try {
    lock(s.pick()); lock(s.pick({ name: 'B.png', decision: 'option B' }))
    assert.equal(cli('supersede', '--dir', s.dir, '--file', 'A.png').status, 0)
    assert.equal(existsSync(join(s.dir, 'approval', 'A.png')), false)
    assert.equal(s.read('approval', '_superseded', 'A.png'), 'png-a')
    assert.match(s.read('approval', 'INDEX.md'), /\| _superseded\/A\.png \| option A, the calm one \|/)
    assert.match(s.read('DECISIONS.md'), /`approval\/_superseded\/A\.png`/)
    const out = cli('check', s.dir)
    assert.equal(out.status, 0); assert.match(out.stdout, /OK approval: 1 folder\(s\), 1 picture\(s\), 0 warning\(s\)/)
    s.put('approval/_superseded/old.png', 'x')
    assert.deepEqual(approvalProblems(s.dir).red, [], 'a picture under _superseded/ needs no row')
    assert.equal(cli('supersede', '--dir', s.dir, '--file', 'A.png').status, 1, 'it is no longer there')
  } finally { s.done() }
})

test('a clean folder is green; the first cell reads through backticks and a Markdown link', () => {
  for (const cell of ['A.png', '`A.png`', '[A.png](A.png)', '[`A.png`](approval/A.png)', '![](A.png)', '`approval/A.png`']) {
    const s = studio()
    try {
      clean(s, `| ${cell} | option A | 2026-11-15 | votes/round-1; card |`)
      assert.deepEqual(approvalProblems(s.dir, s.root), { red: [], warn: [], pictures: 1, folder: true }, cell)
      assert.deepEqual(listAll(s.root), ['lib/characters/CH_x | A.png | option A | 2026-11-15'], cell)
    } finally { s.done() }
  }
})

test('RED: approval/ holds a picture and no INDEX.md', () => {
  const s = studio()
  try {
    clean(s); rmSync(join(s.dir, 'approval', 'INDEX.md'))
    assert.match(approvalProblems(s.dir).red.join('|'), /^approval\/ holds 1 picture\(s\) and no INDEX\.md/)
    assert.equal(cli('check', s.dir).status, 1)
  } finally { s.done() }
})

test('RED: a picture without a row, and a row whose picture is not there', () => {
  const s = studio()
  try {
    clean(s); s.put('approval/B.jpg', 'x'); s.put('DECISIONS.md', '`approval/A.png` `approval/B.jpg`\n')
    assert.deepEqual(approvalProblems(s.dir).red, ['approval/B.jpg has no INDEX.md row'])
    rmSync(join(s.dir, 'approval', 'B.jpg')); rmSync(join(s.dir, 'approval', 'A.png')); s.put('DECISIONS.md', 'the sheet named approval/A.png moved\n')
    assert.match(approvalProblems(s.dir).red.join('|'), /INDEX\.md row names A\.png, which is not in approval\//)
  } finally { s.done() }
})

test('RED: a row lacking its date, its decision or its source', () => {
  const s = studio()
  try {
    for (const [row, lack] of [['| A.png | option A | soon | votes; card |', 'a date \\(YYYY-MM-DD\\)'], ['| A.png |  | 2026-11-15 | votes; card |', 'a decision'], ['| A.png | option A | 2026-11-15 | |', 'a source']]) {
      clean(s, row)
      assert.match(approvalProblems(s.dir).red.join('|'), new RegExp(`^INDEX\\.md row A\\.png lacks ${lack}$`), row)
    }
  } finally { s.done() }
})

test('RED: DECISIONS.md names a missing approval/<file> (a missing approval/ folder included), or names no INDEX picture', () => {
  const s = studio()
  try {
    s.put('DECISIONS.md', '- 2026-11-15 option A: `approval/A.png`, card.\n')
    assert.deepEqual(approvalProblems(s.dir).red, ['DECISIONS.md names approval/A.png, which is not there'], 'no approval/ folder at all')
    assert.match(check(thingFolders(s.root), s.root).lines.join('\n'), /RED lib\/characters\/CH_x: DECISIONS\.md names approval\/A\.png/, '--all finds a thing folder by its DECISIONS.md too')
    clean(s); s.put('DECISIONS.md', '- 2026-11-15 option A, see the card\n')
    assert.deepEqual(approvalProblems(s.dir).red, ['approval/A.png is named by no DECISIONS.md line'])
  } finally { s.done() }
})

test('RED: an approval/ with no DECISIONS.md beside it prints only that line', () => {
  const s = studio()
  try {
    clean(s); rmSync(join(s.dir, 'DECISIONS.md'))
    assert.deepEqual(approvalProblems(s.dir).red, ['approval/ has no DECISIONS.md beside it'])
  } finally { s.done() }
})

test('WARN, exit 0: a dead backticked path in DECISIONS.md; a path that resolves from the thing folder or the root is quiet', () => {
  const s = studio()
  try {
    clean(s); s.put('gate/r1.md', 'x'); s.put('../../../projects/p/sheet.png', 'x')
    s.put('DECISIONS.md', '- 2026-11-15 option A: `approval/A.png`, sheet `projects/p/sheet.png`, gate `gate/r1.md`, old `gate/r0/`, link `https://x.test/a/b`, word `tights_on`\n')
    assert.deepEqual(approvalProblems(s.dir, s.root), { red: [], warn: ['DECISIONS.md names `gate/r0/`, which resolves neither from the thing folder nor from the root'], pictures: 1, folder: true })
    const out = cli('check', s.dir, '--root', s.root)
    assert.equal(out.status, 0)
    assert.match(out.stdout, /^WARN lib\/characters\/CH_x: DECISIONS\.md names `gate\/r0\/`/m); assert.match(out.stdout, /^OK approval: 1 folder\(s\), 1 picture\(s\), 1 warning\(s\)$/m)
  } finally { s.done() }
})

test('check --all walks lib/ and projects/ to any depth, skips _ and . names; zero approval folders is RED', () => {
  const s = studio()
  try {
    const none = cli('check', '--all', s.root)
    assert.equal(none.status, 1); assert.match(none.stdout, /^RED no approval\/ folder found/m)
    assert.equal(cli('check', s.dir).status, 1, 'one folder with nothing locked is no clean OK either')
    clean(s)
    for (const p of ['../../_archive/CH_old', '../../.trash/CH_gone', '../../../elsewhere/CH_out']) s.put(`${p}/approval/Z.png`, 'x') // each would be red if walked
    s.put('../../../projects/p/scenes/s1/approval/INDEX.md', HEAD); s.put('../../../projects/p/scenes/s1/DECISIONS.md', 'none yet\n')
    assert.deepEqual(thingFolders(s.root).map((d) => d.slice(s.root.length + 1).replace(/\\/g, '/')), ['lib/characters/CH_x', 'projects/p/scenes/s1'])
    const out = cli('check', '--all', s.root)
    assert.equal(out.status, 0); assert.match(out.stdout, /^OK approval: 2 folder\(s\), 1 picture\(s\), 0 warning\(s\)$/m)
    assert.equal(cli('list', '--all', s.root).stdout, 'lib/characters/CH_x | A.png | option A | 2026-11-15\n')
  } finally { s.done() }
})

test('the role files name the lock: Designer step 5 before the round folder goes, Animator and Character TD at their Start step, Archivist line 5', () => {
  const role = (r) => readFileSync(new URL(`../.claude/skills/operator/roles/${r}.md`, import.meta.url), 'utf8')
  assert.match(role('designer'), /^3\. [^\n]*attaches the option images to its reply \(a decision card is text only\)/m)
  assert.match(role('designer'), /^5\. [^\n]*approve\.mjs lock --dir[^\n]*--msg[^\n]*then deletes that round's folder/m)
  for (const r of ['animator', 'character-td']) assert.match(role(r), /\*\*Start step \(#582\):\*\*[^\n]*his OK on a passed strip, is locked the same way[^\n]*approve\.mjs lock/, r)
  assert.match(role('archivist'), /\(5\) laptop cleanup:[^\n]*approve\.mjs check --all <studio root>[^\n]*approval not run: laptop offline/)
})

test('brief prints the two brief lines for a locked picture; a wrong call exits 2', () => {
  const s = studio()
  try {
    lock(s.pick())
    const out = cli('brief', '--dir', s.dir, '--file', 'A.png', '--source', 'votes/round-1')
    assert.equal(out.stdout, `Target image: ${join(s.dir, 'approval', 'A.png').replace(/\\/g, '/')}\nSource: votes/round-1\n`)
    assert.equal(cli('brief', '--dir', s.dir, '--file', 'none.png', '--source', 'x').status, 1)
    assert.equal(cli('check').status, 2); assert.equal(cli('nonsense', 'x').status, 2)
  } finally { s.done() }
})

// Gate round 1 of PR 708 (fresh Reviewer, head e5b2e39): five fixes, each test red before its fix.
import { supersede } from './approve.mjs'

test('gate fix 1: supersede takes only a picture name; INDEX.md, ../ and nested paths exit 2 and move nothing', () => {
  const s = studio()
  try {
    clean(s); s.put('../DECISIONS.md', 'keep')
    for (const bad of ['INDEX.md', '../DECISIONS.md', '../../CH_y/approval/A.png']) {
      const out = cli('supersede', '--dir', s.dir, '--file', bad)
      assert.equal(out.status, 2, bad)
      assert.throws(() => supersede({ dir: s.dir, file: bad }), /picture name/, bad)
    }
    assert.ok(existsSync(join(s.dir, 'approval', 'INDEX.md'))); assert.ok(existsSync(join(s.dir, 'approval', 'A.png')))
    assert.equal(readFileSync(join(s.dir, '..', 'DECISIONS.md'), 'utf8'), 'keep')
    assert.equal(existsSync(join(s.dir, 'approval', '_superseded')), false)
  } finally { s.done() }
})

test('gate fix 2: lock refuses a name that already has an INDEX row although its picture is gone', () => {
  const s = studio()
  try {
    lock(s.pick())
    rmSync(join(s.dir, 'approval', 'A.png'))
    const before = s.read('approval', 'INDEX.md')
    assert.throws(() => lock(s.pick()), /supersede|new name/)
    assert.equal(s.read('approval', 'INDEX.md'), before, 'no second row')
  } finally { s.done() }
})

test('gate fix 3: a DECISIONS.md citing another folder\'s existing pick is no false RED', () => {
  const s = studio()
  try {
    clean(s)
    const other = join(s.root, 'lib', 'a', 'b', 'c', 'CH1')
    mkdirSync(join(other, 'approval'), { recursive: true }); writeFileSync(join(other, 'approval', 'A.PNG'), 'x')
    s.put('DECISIONS.md', '- 2026-11-15 option A: `approval/A.png`, card\n- see lib/a/b/c/CH1/approval/A.PNG\n')
    const r = approvalProblems(s.dir, s.root)
    assert.deepEqual([r.red, r.warn], [[], []])
  } finally { s.done() }
})

test('gate fix 4: every picture type needs its own row (.webp .gif .pdf .jpeg .PNG)', () => {
  for (const name of ['B.webp', 'B.gif', 'B.pdf', 'B.jpeg', 'B.PNG']) {
    const s = studio()
    try {
      clean(s); s.put(`approval/${name}`, 'x')
      assert.ok(approvalProblems(s.dir, s.root).red.some((l) => l.includes(`approval/${name} has no INDEX.md row`)), name)
    } finally { s.done() }
  }
})

test('gate fix 5: a superseded row with no DECISIONS.md mention is no RED', () => {
  const s = studio()
  try {
    clean(s)
    s.put('approval/_superseded/A2.png', 'x')
    s.put('approval/INDEX.md', `${HEAD}| A.png | option A | 2026-11-15 | votes/round-1; card |\n| _superseded/A2.png | old | 2026-11-14 | votes/round-0; card |\n`)
    assert.deepEqual(approvalProblems(s.dir, s.root).red, [])
  } finally { s.done() }
})

// Gate round 2 of PR 708 (fresh Reviewer, head 3f2b405): the DECISIONS.md cite is matched with one boundary everywhere.
test('gate round 2, fix 1a: check demands the own pick\'s DECISIONS line although another folder cites a same-named pick', () => {
  const s = studio()
  try {
    s.put('approval/A.png', 'x'); s.put('approval/INDEX.md', `${HEAD}| A.png | option A | 2026-11-15 | votes/round-1; card |\n`)
    s.put('DECISIONS.md', '- see lib/characters/CH_y/approval/A.png\n')
    assert.ok(approvalProblems(s.dir, s.root).red.some((l) => /approval\/A\.png is named by no DECISIONS\.md line/.test(l)))
  } finally { s.done() }
})

test('gate round 2, fix 1b: lock writes its own DECISIONS line although another folder cites a same-named pick', () => {
  const s = studio()
  try {
    s.put('DECISIONS.md', '- see lib/characters/CH_y/approval/A.png\n')
    lock(s.pick())
    assert.match(s.read('DECISIONS.md'), /^- 2026-11-16 option A, the calm one: `approval\/A\.png`/m)
  } finally { s.done() }
})

test('gate round 2, fix 1c: supersede leaves another folder\'s cite alone and rewrites its own', () => {
  const s = studio()
  try {
    lock(s.pick())
    s.put('DECISIONS.md', `${s.read('DECISIONS.md')}- see lib/characters/CH_y/approval/A.png\n`)
    supersede({ dir: s.dir, file: 'A.png' })
    const t = s.read('DECISIONS.md')
    assert.match(t, /`approval\/_superseded\/A\.png`/)
    assert.match(t, /lib\/characters\/CH_y\/approval\/A\.png/)
    assert.doesNotMatch(t, /CH_y\/approval\/_superseded/)
  } finally { s.done() }
})

test('gate round 2, fix 2: a backticked prefixed approval path is resolved, not skipped (the ^ anchor)', () => {
  const s = studio()
  try {
    clean(s)
    const other = join(s.root, 'lib', 'a', 'b', 'c', 'CH1')
    mkdirSync(join(other, 'approval'), { recursive: true }); writeFileSync(join(other, 'approval', 'A.PNG'), 'x')
    s.put('DECISIONS.md', '- 2026-11-15 option A: `approval/A.png`, card\n- ok `lib/a/b/c/CH1/approval/A.PNG`\n')
    assert.deepEqual(approvalProblems(s.dir, s.root).warn, [])
    s.put('DECISIONS.md', '- 2026-11-15 option A: `approval/A.png`, card\n- dead `lib/a/b/c/CH1/approval/Z.png`\n')
    assert.equal(approvalProblems(s.dir, s.root).warn.length, 1)
  } finally { s.done() }
})
