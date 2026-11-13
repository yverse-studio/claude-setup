// The PR Lessons: line: a named home or "none, because ...", nothing else.
// Run: node --test scripts/pr-lessons-check.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { checkLessons, checkPriorArt, checkIssue, issueNumber, ISSUE_MESSAGE } from './pr-lessons-check.mjs'

const body = (line) => `## What changes\nx\n\n${line}\n`

test('passes with a reason', () => {
  assert.ok(checkLessons(body('Lessons: none, because the fix is covered by a test')))
})
test('passes with a path and section', () => {
  assert.ok(checkLessons(body('Lessons: .claude/skills/operator/roles/programmer.md (Lessons)')))
})
test('passes with two paths', () => {
  assert.ok(checkLessons(body('Lessons: scripts/pr-lessons-check.mjs, .claude/skills/operator/gate.md (Checks)')))
})
test('fails without a line', () => {
  assert.equal(checkLessons('## What changes\nx\n'), false)
})
test('fails on an empty line', () => {
  assert.equal(checkLessons(body('Lessons:')), false)
  assert.equal(checkLessons(body('Lessons: ')), false)
})
test('fails on none without a because', () => {
  assert.equal(checkLessons(body('Lessons: none')), false)
})
test('fails on a too short reason', () => {
  assert.equal(checkLessons(body('Lessons: none, because x')), false)
})

test('passes for a hook, a test or a python file, and with CRLF line endings', () => {
  assert.equal(checkLessons(body('Lessons: global/attempt-guard.mjs, scripts/guards.test.mjs')), true)
  assert.equal(checkLessons(body('Lessons: .claude/skills/watch/scripts/watch.py (Learnings)')), true)
  assert.equal(checkLessons(body('Lessons: none, because the check covers it').replace(/\n/g, '\r\n')), true)
})

test('the unfilled PR template fails, so the hint comment never counts as the line', () => {
  assert.equal(checkLessons(readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')), false)
})


test('prior art: a decision with what was checked passes, a bare or empty line fails', () => {
  assert.ok(checkPriorArt(body('Prior art: ECC hooks and obra/superpowers checked; adapt the hook pattern, because ours must read hearthbot tools')))
  assert.ok(checkPriorArt(body('Prior art: none, because this is a one-line typo fix')))
  assert.equal(checkPriorArt(body('Prior art:')), false)
  assert.equal(checkPriorArt(body('Prior art: looked around')), false)
  assert.equal(checkPriorArt('## What changes\nx\n'), false)
})

test('a fix PR names the check that now catches the miss', async () => {
  const { checkFixHasCheck } = await import('./pr-lessons-check.mjs')
  assert.ok(checkFixHasCheck('fix: x', body('Lessons: scripts/guards.test.mjs')))
  assert.ok(checkFixHasCheck('fix(hq): x', body('Lessons: global/rule-guard.mjs, docs/MAP.md')))
  assert.ok(checkFixHasCheck('fix: x', body('Lessons: none, because a typo has nothing to check')))
  assert.equal(checkFixHasCheck('fix: x', body('Lessons: docs/MAP.md')), false, 'a doc line alone is no check')
  assert.ok(checkFixHasCheck('docs: x', body('Lessons: docs/MAP.md')), 'only fix PRs')
  assert.ok(checkFixHasCheck(undefined, body('Lessons: docs/MAP.md')), 'no title given')
})

test('a scored asset PR links the real frames', async () => {
  const { checkRender } = await import('./pr-lessons-check.mjs')
  assert.equal(checkRender('Gate 5/5: the pose clears every contact.'), false)
  assert.ok(checkRender('Gate 5/5: the pose clears every contact.\nRender: .shots/pose-front.png'))
  assert.ok(checkRender('Gate 5/5 for the scene.\nRender: https://example.com/strip'))
  assert.equal(checkRender('Gate 4/5, scene.\nRender: looked at it'), false, 'a claim is no link')
  assert.ok(checkRender('Scored gates pass at 4.5/5 (render, clip).\nRender: none, because this PR changes the gate text, no asset'), 'a PR about the rule itself')
  assert.equal(checkRender('Gate 4/5, scene.\nRender: none, because'), false, 'none needs its reason')
  assert.ok(checkRender('Gate 5/5: the login form works.'), 'no asset, no render line')
})

// yskills 2026-11-12: "erst schauen was gut funktioniert, dann klauen oder reverse engineeren, dann selber bauen". One corpus, both homes:
// the brief check (global/team-guard.mjs) and the PR body check say the same about a Prior art line: real findings, not a gesture.
test('Prior art: a named source and a decision pass, a gesture fails, in the brief and in the PR body', async () => {
  const { needsPriorArt } = await import('../global/team-guard.mjs')
  const good = [
    'Prior art: obra/superpowers and our gate.md checked -> adapt, because ours reads hearthbot tools',
    'Prior art: Mario Party map at https://example.com/x studied, copy the node layout, because it reads at a glance',
    'Prior art: `ralph-loop` Stop hook and #444 ledger -> reuse the counter, because it exists',
    'Prior art: none, because this is a one-line typo fix',
  ]
  const bad = [
    'Prior art: looked around a bit and found nothing much',
    'Prior art: ECC hooks and superpowers checked; adapt the hook, because ours differ',
    'Prior art: checked, build my own, because I want to',
    'Prior art:',
  ]
  for (const l of good) {
    assert.equal(needsPriorArt(`Role: Programmer · Kit: setup · Size: S\n${l}`), false, `brief: ${l}`)
    if (!l.includes('example.com')) assert.ok(checkPriorArt(`${l}\n`), `body: ${l}`)
  }
  for (const l of bad) {
    assert.equal(needsPriorArt(`Role: Programmer · Kit: setup · Size: S\n${l}`), true, `brief: ${l}`)
    assert.equal(checkPriorArt(`${l}\n`), false, `body: ${l}`)
  }
  assert.equal(needsPriorArt('Role: Researcher · Kit: setup · Size: S\nPrior art: to find: Researcher reads how Mario Party maps work'), false, 'to find: is the brief for a Researcher that has not run yet')
})

// S3 (#544): a PR names its issue with a GitHub closing keyword and #n; no escape line.
test('a PR body without a closing keyword and #n fails with the message; Fixes #12 passes; Fixes PR 12 fails', () => {
  assert.equal(checkIssue('## What changes\nx\n'), false)
  assert.match(ISSUE_MESSAGE, /Fixes #/)
  assert.ok(existsSync(new URL('../.github/pull_request_template.md', import.meta.url)), 'the file the message points at exists')
  assert.ok(checkIssue(body('Fixes #12')))
  assert.equal(checkIssue(body('Fixes PR 12')), false)
  assert.equal(checkIssue(body('Fixes #')), false)
  assert.equal(checkIssue(body('see #12')), false, 'a plain mention closes nothing')
  assert.equal(checkIssue(body('Prefixes #12')), false)
})
test('every closing keyword, any case, bullet or other-repo prefix; the number comes back', () => {
  for (const k of ['fix', 'Fixes', 'Fixed', 'CLOSE', 'closes', 'Closed', 'Resolve', 'RESOLVES', 'resolved']) assert.ok(checkIssue(body(`${k} #7`)), k)
  assert.ok(checkIssue(body('- Fixes #7')))
  assert.ok(checkIssue(body('Fixes: #7')))
  assert.equal(issueNumber(body('Closes #543')), 543)
  assert.equal(issueNumber('nothing'), null)
})
test('the PR template carries the Fixes # line, the CI step verifies an open issue that is no PR', () => {
  const tpl = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')
  assert.match(tpl, /^Fixes #/m)
  const yml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.match(yml, /issues: read/)
  assert.match(yml, /pr-lessons-check\.mjs[^\n]*--issue/)
  assert.match(yml, /state==\\?"open\\?"/)
})
