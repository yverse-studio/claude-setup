import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (text) => {
  const f = join(mkdtempSync(join(tmpdir(), 'rc-')), 'r.md')
  writeFileSync(f, text)
  return spawnSync('node', ['scripts/research-check.mjs', f], { encoding: 'utf8' })
}

test('a report with sources and a Not checked list passes', () => {
  assert.equal(run('# R\n- claim (`a.md:3`)\n## Sources\n- https://x\nNot checked:\n- foo\n').status, 0)
})
test('a claim without a source fails', () => {
  assert.match(run('# R\n- claim\n## Sources\n- https://x\nNot checked:\n').stderr, /line 2 has no source/)
})
test('a report without Not checked fails', () => {
  assert.match(run('# R\n## Sources\n- https://x\n').stderr, /Not checked/)
})
test('table header and divider rows are not claims, body rows need a source', () => {
  const t = (row) => run(`# R\n| Product | Price |\n|:--|--|\n${row}\n## Sources\n- https://x\nNot checked:\n`)
  assert.equal(t('| a | 5 (https://x) |').status, 0)
  assert.match(t('| a | 5 |').stderr, /line 4 has no source/)
})
test('a Resources heading is not a Sources section', () => {
  assert.match(run('# R\n- c (https://x)\n## Resources\nNot checked:\n').stderr, /no "Sources"/)
})
test('claims after the Not checked list are still checked', () => {
  assert.match(run('# R\nNot checked:\n- gap\n## Sources\n- https://x\n## More\n- claim\n').stderr, /line 7 has no source/)
})
test('sentences and numbered items need a source too', () => {
  assert.match(run('# R\nFoo is free.\n1. Bar is cheap\n## Sources\n- https://x\nNot checked:\n').stderr, /line 2[\s\S]*line 3/)
})
test('a sentence after the Not checked list needs a source', () => {
  assert.match(run('# R\n## Sources\n- https://x\nNot checked:\n- gap\n\nFoo costs 5 euro.\n').stderr, /line 7 has no source/)
})
test('a host:port in backticks is not a source', () => {
  assert.match(run('# R\n- runs on `localhost:8787`\n## Sources\n- https://x\nNot checked:\n').stderr, /line 2 has no source/)
})
test('a heading that merely mentions sources is not a Sources section', () => {
  assert.match(run('# R\n- c (https://x)\n## No sources found\nNot checked:\n').stderr, /no "Sources"/)
})

// #595: a report with a "## 4b" teardown needs the six topics and one [S] line with a link per product block.
const TOPICS = 'tech stack, cost model, smart part, cheap and stable, complaints, copy/skip list'
const wrap = (sec) => `# R\n- c (https://x)\n${sec}\n## Sources\n- https://x\nNot checked:\n`
test('4b: a teardown block with the six topics and an [S] link passes', () => {
  assert.equal(run(wrap(`## 4b. Teardown of a shipped product\n### Game A\n- [S] ${TOPICS} (https://store.example/a)`)).status, 0)
})
test('4b: a missing topic, or a product block with no [S] link, fails; a report without 4b is unaffected', () => {
  assert.match(run(wrap('## 4b. Teardown of a shipped product\n### Game A\n- [S] tech stack, cost model (https://x)')).stderr, /4b.*(smart part|complaints|topic)/)
  assert.match(run(wrap(`## 4b. Teardown of a shipped product\n### Game A\n- inferred ${TOPICS}`)).stderr, /4b.*\[S\]/)
  assert.equal(run(wrap('## 4. Built with Claude already\n- c (https://x)')).status, 0)
})

// #622: a page that cites our own files opens with one of them (path:line) before any outside source.
test('#622: a page with a repo path:line whose first source is outside fails; ours first passes', () => {
  const page = (a, b) => `# R\n- ${a}\n- ${b}\n## Sources\n- https://x\nNot checked:\n`
  assert.match(run(page('push channel (https://docs.ntfy.sh/publish/)', 'the script (`scripts/research-check.mjs:1`)')).stderr, /ours first/)
  assert.equal(run(page('the script (`scripts/research-check.mjs:1`)', 'push channel (https://docs.ntfy.sh/publish/)')).status, 0)
  assert.equal(run(page('push channel (https://docs.ntfy.sh/publish/)', 'price (https://x/y)')).status, 0) // no repo path at all: unaffected
})

// #623: a cited path:line must exist in the checkout; --show prints the cited lines.
test('#623: a line number past the end of an existing file fails, in range or single', () => {
  const page = (cite) => `# R\n- the check (\`${cite}\`)\n## Sources\n- https://x\nNot checked:\n`
  assert.equal(run(page('scripts/research-check.mjs:1-2')).status, 0)
  assert.match(run(page('scripts/research-check.mjs:99999')).stderr, /past the end/)
  assert.match(run(page('scripts/research-check.mjs:1-99999')).stderr, /past the end/)
  assert.equal(run(page('no/such/file.md:72-73')).status, 0) // not in this checkout: cannot be checked
})
test('#623: --show prints the lines beside the claim', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'rc-')), 'r.md')
  writeFileSync(f, '# R\n- the check (`scripts/research-check.mjs:1`)\n## Sources\n- https://x\nNot checked:\n')
  const r = spawnSync('node', ['scripts/research-check.mjs', '--show', f], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /scripts\/research-check\.mjs:1\b.*Checks a research report/)
})

// Gate round 1 of PR 716: header and own-file links are not outside sources, any cwd, last line, line 0 and reversed ranges.
test('#622: a Method header link, a relative link to our own file before the first claim do not count as outside', () => {
  const page = (intro, a, b) => `# R\n${intro}\n## 1. What we have\n- ${a}\n- ${b}\n## Sources\n- https://x\nNot checked:\n`
  const mine = 'the script (`scripts/research-check.mjs:1`)'
  assert.equal(run(page('Method: [`roles/researcher.md`](../roles/researcher.md). Item: [#606](https://github.com/yverse-studio/claude-setup/issues/606)', mine, 'push (https://docs.ntfy.sh/)')).status, 0)
  assert.equal(run(page('x (https://x)', 'see [the plan](../plan.md)', 'push (https://docs.ntfy.sh/)')).status, 0)
  assert.match(run(page('x (https://x)', 'push (https://docs.ntfy.sh/)', mine)).stderr, /ours first/)
})
test('#623: the checks read the checkout whatever the cwd; last line passes, one past fails; line 0 and a reversed range fail', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'rc-')), 'r.md')
  const at = (cite, cwd) => { writeFileSync(f, `# R\n- c (\`${cite}\`)\n## Sources\n- https://x\nNot checked:\n`); return spawnSync('node', [join(process.cwd(), 'scripts/research-check.mjs'), f], { encoding: 'utf8', cwd }) }
  assert.match(at('scripts/research-check.mjs:99999', tmpdir()).stderr, /past the end/)
  const n = readFileSync('scripts/research-check.mjs', 'utf8').split('\n').length - 1
  assert.equal(at(`scripts/research-check.mjs:${n}`).status, 0)
  assert.match(at(`scripts/research-check.mjs:${n + 1}`).stderr, /past the end/)
  assert.match(at('scripts/research-check.mjs:0').stderr, /not a line/)
  assert.match(at('scripts/research-check.mjs:9-3').stderr, /not a line/)
})

// Gate round 2 of PR 716: every form of a link to our own file is ours, an own issue link is neutral, headers and skips are pinned.
test('#622: sibling, repo-path and own-repo links are ours; an own issue link is skipped; headers, fences and Not checked do not count', () => {
  const mine = 'the script (`scripts/research-check.mjs:1`)'
  const out = 'push (https://docs.ntfy.sh/)'
  const page = (intro, a) => `# R\n${intro}\n## 1. What we have\n- ${a}\n- ${mine}\n- ${out}\n## Sources\n- https://x\nNot checked:\n`
  for (const a of ['see [verdict](2026-11-08-skills-plugins-verdict.md)', 'see [gate](docs/TEAMS.md)', 'see (https://github.com/yverse-studio/claude-setup/blob/main/scripts/research-check.mjs)'])
    assert.equal(run(page('x (https://x)', a)).status, 0, a)
  assert.equal(run(page('x (https://x)', 'goal ([#606](https://github.com/yverse-studio/claude-setup/issues/606))')).status, 0) // neutral, then ours
  assert.equal(run(page('intro [#1](https://example.com/a)', `see [verdict](../v.md) ${mine}`)).status, 0) // header before the first "##" is not a claim
  assert.match(run(`# R\n## 1. Claims\n\`\`\`\npush (https://example.com)\n\`\`\`\n- ${out}\n- ${mine}\n## Sources\n- https://x\nNot checked:\n`).stderr, /line 6.*ours first/) // fenced line skipped, line 6 is the first claim
  assert.equal(run(`# R\n## 1. Gaps\nNot checked:\n- ${out}\n\n## 2. Claims\n- ${mine}\n## Sources\n- https://x\n`).status, 0) // gap bullets are not claims
})

// Gate round 3 of PR 716 (Reviewer thread): an extension with a digit (.ps1, .mp3) is a path:line too.
test('#623: a .ps1 cite is range-checked, printed by --show and counts as ours first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc-'))
  const f = join(dir, 'r.md')
  const at = (cite, args = []) => { writeFileSync(f, `# R\n## 1. What we have\n- the watchdog (\`${cite}\`)\n- push (https://docs.ntfy.sh/)\n## Sources\n- https://x\nNot checked:\n`); return spawnSync('node', ['scripts/research-check.mjs', ...args, f], { encoding: 'utf8' }) }
  const ps1 = readdirSync('scripts/laptop').find((n) => n.endsWith('.ps1'))
  assert.ok(ps1, 'scripts/laptop holds a .ps1 file')
  assert.match(at(`scripts/laptop/${ps1}:99999`).stderr, /past the end/)
  assert.match(at(`scripts/laptop/${ps1}:1`, ['--show']).stdout, new RegExp(`${ps1.replace('.', '\\.')}:1\\b`))
  assert.equal(at(`scripts/laptop/${ps1}:1`).status, 0, 'a .ps1 cite first is ours first')
})
