// The decisions of the OpenCode guards plugin (.opencode/plugins/guards/decide.mjs). Run: node --test scripts/opencode-guards.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { isEnvFile, modelIds, permissionBlock, subagentBlock } from '../.opencode/plugins/guards/decide.mjs'

const teams = readFileSync(new URL('../docs/TEAMS.md', import.meta.url), 'utf8')
const model = (tier) => modelIds(teams)[tier]

test('model ids come from the Models line of TEAMS.md, one per tier', () => {
  for (const tier of ['fable', 'opus', 'sonnet', 'haiku']) assert.match(model(tier), new RegExp(`^anthropic/claude-${tier}-\\d`))
  assert.deepEqual(modelIds('no models here'), {})
})

test('a subagent with no model is blocked, naming the rule', () => {
  assert.match(subagentBlock({ agent: 'explore', prompt: 'Role: Reviewer' }, undefined, teams), /no model of its own.*Spawn rule 4/)
})

test('the role in the prompt decides the allowed tier (Roster)', () => {
  const brief = (role) => ({ agent: 'x', prompt: `Role: ${role} · Kit: setup · Size: M\nDo it.` })
  assert.equal(subagentBlock(brief('Programmer'), model('sonnet'), teams), null)
  assert.match(subagentBlock(brief('Programmer'), model('opus'), teams), /Programmer runs on sonnet.*not opus/)
  assert.match(subagentBlock(brief('Reviewer'), { providerID: 'anthropic', id: model('haiku').split('/')[1] }, teams), /Reviewer runs on sonnet.*not haiku/)
  assert.equal(subagentBlock(brief('Planner'), model('opus'), teams), null)
  assert.equal(subagentBlock({ agent: 'x', prompt: 'Role: Programmer\nModel: opus (the checkpoint before done)' }, model('opus'), teams), null)
  assert.equal(subagentBlock({ agent: 'x', prompt: 'no role line here' }, model('opus'), teams), null)
})

test('deploys, pkill wrangler and a force push to main are blocked, the rule named', () => {
  const blocked = ['npm run deploy', 'npm run deploy:prod', 'cd app && npm run ship', 'pnpm run deploy', 'npx wrangler deploy', 'powershell -c "npm run deploy"',
    'pkill -f wrangler', 'killall wrangler', 'Stop-Process -Name wrangler', 'git push --force origin main', 'git push -f origin main', 'git push origin +main', 'git push --force-with-lease origin master', 'git -C x push --force origin main']
  for (const c of blocked) assert.match(permissionBlock('shell', ['echo ok', c]), /shell rule/, c)
  assert.match(permissionBlock('shell', ['npm run deploy']), /never a deploy script/)
  const fine = ['npm run build', 'npm test', 'node scripts/check.mjs', 'git push origin claude/project-thread-wcz8tw', 'git push -u origin HEAD', 'git push --force-with-lease origin feat/x', 'git push --dry-run origin main', 'npx wrangler dev', 'pkill node']
  for (const c of fine) assert.equal(permissionBlock('shell', [c]), null, c)
  assert.equal(permissionBlock('read', ['npm run deploy']), null)
})

test('real .env files are blocked, .env.example is not', () => {
  for (const p of ['.env', 'app/.env.local', 'C:\\work\\.env.production', '.dev.vars']) assert.ok(isEnvFile(p), p)
  for (const p of ['.env.example', 'app/.env.example', 'README.md', 'src/env.ts', 'myenv']) assert.ok(!isEnvFile(p), p)
  assert.match(permissionBlock('read', ['.env']), /env rule/)
  assert.match(permissionBlock('edit', ['api/.env.local']), /env rule/)
  assert.equal(permissionBlock('read', ['.env.example']), null)
  assert.equal(permissionBlock('grep', ['.env']), null)
})

test('a shell segment that names a real .env file is blocked', () => {
  for (const c of ['cat .env', 'Get-Content .\\.env.local', 'node --env-file=.env app.js', 'type "C:\\p\\.env"', 'grep KEY config/.env.production']) assert.match(permissionBlock('shell', [c]), /env rule/, c)
  for (const c of ['cat .env.example', 'npm test', 'echo $env:HOME', 'git status']) assert.equal(permissionBlock('shell', [c]), null, c)
  assert.match(permissionBlock('shell', ['echo hi', 'cat .env']), /env rule/)
})
