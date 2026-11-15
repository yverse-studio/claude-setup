// node scripts/role-eval.mjs <role> ["open: ..."]: evals/roles/<role>/ with w/wo role file > config/role-evals.json
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export const passMark = (role) => (['reviewer', 'tester', 'story-editor', 'playtester'].includes(role) ? 3 : 2)
export const roleHash = (t) => createHash('sha256').update(t.split('## Lessons')[0]).digest('hex')

export function modelId(cell, models) {
  const t = cell.match(/Fable|Opus|Sonnet|Haiku/)?.[0]
  const id = t && models.match(new RegExp(`${t} \\((claude-[a-z0-9-]+)\\)`))?.[1]
  if (!id) throw new Error(`no Roster model in "${cell}"`)
  return id
}

export const buildArgs = ({ dir = '.', model, judge, out, json }) => [
  'plugin', 'eval', dir, '--runs', '3', '--ablation', 'with-without', '--max-cost-usd', '3', '--no-publish', '--trust-plugin',
  '--model', model, '--judge-model', judge, '--output-dir', out, '--json', json,
]

export function pluginFiles(role, text, cases) {
  const f = {
    '.claude-plugin/plugin.json': '{"name":"roleeval"}',
    [`skills/${role}/SKILL.md`]: `---\nname: ${role}\ndescription: the ${role} role.\n---\n${text}`,
  }
  for (const [c, { task, graders }] of Object.entries(cases)) {
    f[`evals/${c}/prompt.md`] = task
    f[`evals/${c}/graders/fired.md`] = '---\ntype: tool_used\ntool: Skill\n---\n'
    for (const [n, g] of Object.entries(graders)) f[`evals/${c}/graders/${n}`] = g
  }
  return f
}

export function buildRow({ role, hash, model, date, open, result, prev }) {
  const cases = {}
  for (const c of result.cases) {
    const w = c.arms.with, n = (a) => a.filter((r) => r.passed).length
    cases[c.name] = { role: n(w), baseline: n(c.arms.without ?? []), runs: w.length, fired: w.filter((r) => r.graders.some((g) => g.withOnly && g.passed)).length }
  }
  const needsRole = Object.values(cases).some((c) => c.role - c.baseline >= 2) ? 'yes' : 'no'
  const before = prev ? (prev.before ?? { hash: prev.hash, date: prev.date, cases: prev.cases }) : null
  return { hash, model, date, pass: passMark(role), cases, needsRole, open, costUsd: result.costUsd, before }
}

if (process.argv[1].endsWith('role-eval.mjs')) {
  const [role, open = 'open: none'] = process.argv.slice(2), root = join(import.meta.dirname, '..')
  const rd = (...p) => readFileSync(join(root, ...p), 'utf8')
  const teams = rd('docs/TEAMS.md')
  const line = teams.split('\n').find((l) => l.includes(`[\`${role}.md\`]`))
  const model = modelId(line.split('|').filter(Boolean).pop(), teams)
  const text = rd('docs', line.match(/\]\(([^)]+)\)/)[1])
  const base = `evals/roles/${role}`, cases = {}
  for (const c of readdirSync(join(root, base))) {
    const g = join(base, c, 'graders')
    cases[c] = { task: rd(base, c, 'task.md'), graders: Object.fromEntries(readdirSync(join(root, g)).map((n) => [n, rd(g, n)])) }
  }
  const tmp = mkdtempSync(join(tmpdir(), 're-')), json = join(tmp, 'r.json')
  for (const [p, c] of Object.entries(pluginFiles(role, text, cases))) {
    mkdirSync(dirname(join(tmp, p)), { recursive: true })
    writeFileSync(join(tmp, p), c)
  }
  spawnSync('claude', buildArgs({ dir: tmp, model, judge: modelId('Haiku', teams), out: join(tmp, 'out'), json }), { stdio: ['ignore', 'ignore', 'inherit'] })
  const file = join(root, 'config/role-evals.json')
  let ledger = {}
  try { ledger = JSON.parse(readFileSync(file, 'utf8')) } catch {}
  const r = (ledger[role] = buildRow({ role, hash: roleHash(text), model, date: new Date().toISOString().slice(0, 10), open, result: JSON.parse(readFileSync(json, 'utf8')), prev: ledger[role] }))
  writeFileSync(file, JSON.stringify(ledger, null, 2) + '\n')
  for (const [c, n] of Object.entries(r.cases)) console.log(`${role} ${c}: role ${n.role}/${n.runs} baseline ${n.baseline}/${n.runs} fired ${n.fired} need ${r.pass}`)
  console.log(`needs role file: ${r.needsRole}; ${r.open}; ${r.costUsd.toFixed(2)} USD`)
}
