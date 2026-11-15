// role-eval.mjs <role> ["open: ..."]
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync as ex, mkdirSync, mkdtempSync, readdirSync as ls, readFileSync as rf, writeFileSync as wf } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
export const passMark = (r) => (/^(reviewer|tester|story-editor|playtester)$/.test(r) ? 3 : 2)
export const roleHash = (t) => createHash('sha256').update(t.split('## Lessons')[0]).digest('hex')
export function modelId(cell, models) {
  const t = cell.match(/Fable|Opus|Sonnet|Haiku/)?.[0]
  const id = t && models.match(new RegExp(`${t} \\((claude-[a-z0-9-]+)\\)`))?.[1]
  if (!id) throw new Error(`no Roster model in "${cell}"`)
  return id
}
export const buildArgs = ({ dir, model, judge, out, json }) => [
  'plugin', 'eval', dir, '--runs', '3', '--ablation', 'with-without', '--max-cost-usd', '3', '--no-publish', '--trust-plugin', '--model', model,
  '--judge-model', judge, '--output-dir', out, '--json', json]
export function pluginFiles(role, text, cases) {
  const f = {
    '.claude-plugin/plugin.json': '{"name":"roleeval"}',
    [`skills/${role}/SKILL.md`]: `---\nname: ${role}\ndescription: ${role} role.\n---\n${text}`,
  }
  for (const [c, { task, graders }] of Object.entries(cases)) {
    f[`evals/${c}/prompt.md`] = task
    for (const [n, g] of Object.entries({ 'fired.md': '---\ntype: tool_used\ntool: Skill\n---\n', ...graders })) f[`evals/${c}/graders/${n}`] = g
  }
  return f
}
export function buildRow({ role, hash, model, date, open, result, prev, version }) {
  const cases = {}
  for (const c of result.cases) {
    const w = c.arms.with, b = c.arms.without, n = (a) => a.filter((r) => r.passed).length
    if (result.partial || !b?.length || [...w, ...b].some((r) => r.error)) throw new Error(`no row: partial, errored or no baseline`)
    cases[c.name] = { role: n(w), baseline: n(b), runs: w.length, fired: w.filter((r) => r.graders.some((g) => g.withOnly && g.passed)).length }
  }
  const v = Object.values(cases)
  const needsRole = v.some((c) => c.role - c.baseline >= 2) ? 'yes' : v.every((c) => c.baseline >= c.role) ? 'no' : 'unclear'
  return { hash, model, claude: version, date, pass: passMark(role), cases, needsRole, open, costUsd: result.costUsd, before: prev && (prev.before ?? prev) }
}
if (process.argv[1].endsWith('eval.mjs')) {
  const [role, open = 'open: ?'] = process.argv.slice(2), root = join(import.meta.dirname, '..')
  const rd = (...p) => rf(join(root, ...p)) + '', teams = rd('docs/TEAMS.md')
  const line = teams.split('\n').find((l) => l.includes(`[\`${role}.md\`]`))
  const model = modelId(line.split('|').at(-2), teams)
  const text = rd('docs', line.match(/\]\(([^)]+)\)/)[1])
  const base = `evals/roles/${role}`, cases = {}
  for (const c of ls(join(root, base))) {
    const g = `${base}/${c}/graders`
    cases[c] = { task: rd(base, c, 'task.md'), graders: Object.fromEntries(ls(join(root, g)).map((n) => [n, rd(g, n)])) }
  }
  const tmp = mkdtempSync(join(tmpdir(), 're-')), json = join(tmp, 'r.json')
  for (const [p, c] of Object.entries(pluginFiles(role, text, cases))) {
    mkdirSync(dirname(join(tmp, p)), { recursive: true })
    wf(join(tmp, p), c)
  }
  spawnSync('claude', buildArgs({ dir: tmp, model, judge: modelId('Opus', teams), out: join(tmp, 'out'), json }), { stdio: ['ignore', 'ignore', 'inherit'] })
  const file = join(root, 'config/role-evals.json')
  const ledger = ex(file) ? JSON.parse(rf(file)) : {}, date = new Date().toJSON().slice(0, 10)
  const version = String(spawnSync('claude', ['--version']).stdout).trim()
  const r = (ledger[role] = buildRow({ role, hash: roleHash(text), model: model.slice(7), version, date, open, result: JSON.parse(rf(json)), prev: ledger[role] }))
  wf(file, JSON.stringify(ledger, null, 2))
  for (const [c, n] of Object.entries(r.cases)) console.log(`${role} ${c}: role ${n.role}/${n.runs} baseline ${n.baseline}/${n.runs} fired ${n.fired}`)
  console.log(`needs role file: ${r.needsRole}; ${r.open}; ${r.costUsd.toFixed(2)}; ${json}`)
}
