#!/usr/bin/env node
// Validates the repo: JSON parses, every skill and agent has name/description frontmatter,
// every name is unique, and the vendored ECC subset matches config/ecc.json.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const json = (p) => { try { return JSON.parse(readFileSync(join(root, p), 'utf8')) } catch (e) { errors.push(`${p}: ${e.message}`); return null } }

for (const p of ['config/ecc.json', 'config/plugins.json', 'global/settings.json', '.claude/settings.json', '.claude/skills/onboard-project/templates/settings.json', '.claude/skills/operator/templates/features.json', '.claude/skills/operator/templates/metrics.json']) json(p)

function frontmatter(file) {
  const m = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const out = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2]
  }
  return out
}

const dirs = (p) => (existsSync(join(root, p)) ? readdirSync(join(root, p)).filter((n) => statSync(join(root, p, n)).isDirectory()) : [])
const mds = (p) => (existsSync(join(root, p)) ? readdirSync(join(root, p)).filter((n) => n.endsWith('.md')) : [])
const seen = { skill: new Map(), agent: new Map() }
// Agent `model:` aliases Claude Code accepts (docs/WORKFLOW.md, Models); a typo here silently falls back to inherit.
const MODELS = new Set(['fable', 'opus', 'sonnet', 'haiku', 'inherit'])
function check(kind, file, expected) {
  const fm = frontmatter(join(root, file))
  if (!fm) return errors.push(`${file}: missing frontmatter`)
  if (!fm.name) errors.push(`${file}: missing name`)
  if (!fm.description) errors.push(`${file}: missing description`)
  if (fm.name && fm.name !== expected) errors.push(`${file}: name "${fm.name}" does not match "${expected}"`)
  if (kind === 'agent' && fm.model && !MODELS.has(fm.model)) errors.push(`${file}: model "${fm.model}" is not one of ${[...MODELS].join(', ')}`)
  if (seen[kind].has(expected)) errors.push(`${kind} "${expected}" defined twice: ${seen[kind].get(expected)} and ${file}`)
  seen[kind].set(expected, file)
}
for (const n of dirs('.claude/skills')) check('skill', `.claude/skills/${n}/SKILL.md`, n)
for (const f of mds('.claude/agents')) check('agent', `.claude/agents/${f}`, f.replace(/\.md$/, ''))

const ecc = json('config/ecc.json')
if (ecc) {
  const skills = new Set(dirs('.claude/skills'))
  for (const s of ecc.skills) if (!skills.has(s)) errors.push(`config/ecc.json lists skill ${s} but .claude/skills/${s} is missing; run scripts/sync-ecc.mjs`)
  const agents = new Set(mds('.claude/agents').map((f) => f.replace(/\.md$/, '')))
  for (const a of ecc.agents) if (!agents.has(a)) errors.push(`config/ecc.json lists agent ${a} but it is not vendored`)
  for (const r of ecc.rules) if (!existsSync(join(root, '.claude/rules/ecc', r))) errors.push(`rules pack ${r} is not vendored`)
}

const plugins = json('config/plugins.json')
if (plugins) {
  const ids = [...plugins.global, ...plugins.project].map((p) => p.id)
  for (const id of ids) if (!/^[a-z0-9-]+@[a-z0-9-]+$/.test(id)) errors.push(`config/plugins.json: bad plugin id ${id}`)
  if (new Set(ids).size !== ids.length) errors.push('config/plugins.json: duplicate plugin id')
  // cloud/setup.sh installs the global plugins in cloud threads; it must list exactly the same ones,
  // minus those marked "cloud": false (Context7 asks for a sign-in a thread can't do).
  const sh = readFileSync(join(root, 'cloud/setup.sh'), 'utf8')
  const shIds = [...sh.matchAll(/^\s+([a-z0-9-]+@[a-z0-9-]+)/gm)].map((m) => m[1])
  const want = plugins.global.filter((p) => p.cloud !== false).map((p) => p.id)
  if (shIds.join() !== want.join()) errors.push('cloud/setup.sh plugin list differs from config/plugins.json global')
  // Plugins come from setup.sh at user scope; a second list in the repo's settings would drift.
  if (json('.claude/settings.json')?.enabledPlugins) errors.push('.claude/settings.json must not list plugins; cloud/setup.sh installs them')
  for (const m of plugins.marketplaces) if (!sh.includes(`marketplace add ${m.source}`)) errors.push(`cloud/setup.sh does not add marketplace ${m.source}`)
  const inlined = sh.match(/<<'GUARD'\r?\n([\s\S]*?)\r?\nGUARD\r?\n/)?.[1]
  if (inlined?.replace(/\r/g, '').trim() !== readFileSync(join(root, 'global/context-guard.mjs'), 'utf8').replace(/\r/g, '').trim()) errors.push('cloud/setup.sh context guard differs from global/context-guard.mjs')
}

// Every ECC skill a toolbox catalog names must exist in the ECC index.
const index = json('.claude/skills/toolbox/ecc-index.json')
if (index) {
  const names = new Set(index.skills.map((x) => x.name))
  for (const f of readdirSync(join(root, '.claude/skills/toolbox/catalog'))) {
    for (const m of readFileSync(join(root, '.claude/skills/toolbox/catalog', f), 'utf8').matchAll(/ECC skills? ([^|\n]*)/g)) {
      for (const n of m[1].matchAll(/`([a-z0-9-]+)`/g)) if (!names.has(n[1])) errors.push(`catalog/${f}: unknown ECC skill ${n[1]}`)
    }
  }
}

// Every mod the local marketplace lists is a plugin folder with the same name and a hooks module.
const mods = json('mods/.claude-plugin/marketplace.json')
for (const m of mods?.plugins ?? []) {
  const manifest = json(join('mods', m.source, '.claude-plugin/plugin.json'))
  if (manifest && manifest.name !== m.name) errors.push(`mods/${m.source}: plugin.json name "${manifest.name}" does not match "${m.name}"`)
  for (const mod of json(join('mods', m.source, 'hooks/hooks.json'))?.modules ?? []) {
    if (!existsSync(join(root, 'mods', m.source, 'hooks', mod))) errors.push(`mods/${m.source}: hooks module ${mod} is missing`)
  }
}

// Project deny rules are a copy of global's (the project file applies in one-repo sessions only).
const gDeny = json('global/settings.json')?.permissions?.deny ?? []
const pDeny = json('.claude/settings.json')?.permissions?.deny ?? []
if (gDeny.join() !== pDeny.join()) errors.push('.claude/settings.json deny list differs from global/settings.json')

// Our own docs: relative markdown links resolve, and phrases that describe a rule we dropped stay out.
const BANNED = [/merge tap/i, /caveman voice/i]
const walk = (d) => readdirSync(join(root, d)).flatMap((n) => {
  const rel = `${d}/${n}`
  if (statSync(join(root, rel)).isDirectory()) return walk(rel)
  return rel.endsWith('.md') ? [rel] : []
})
const eccDirs = (ecc?.skills ?? []).map((n) => `.claude/skills/${n}/`)
// docs/research holds dated notes that quote old paths; they are history, not instructions.
const OWN_DOCS = ['README.md', 'CLAUDE.md', ...walk('docs').filter((f) => !f.startsWith('docs/research/'))]
const own = [...OWN_DOCS, ...walk('.claude/skills').filter((f) => !eccDirs.some((e) => f.startsWith(e))), ...walk('.claude/agents')]
// Vendored files are link-checked too: sync-ecc.mjs unlinks targets the subset left out.
for (const f of [...own, ...walk('.claude/rules'), ...walk('.claude/skills').filter((f) => eccDirs.some((e) => f.startsWith(e)))]) {
  const text = readFileSync(join(root, f), 'utf8')
  if (own.includes(f)) for (const re of BANNED) if (re.test(text)) errors.push(`${f}: banned phrase ${re}`)
  for (const m of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s#]+)(?:#[^)]*)?\)/g)) {
    if (!existsSync(join(root, dirname(f), m[1]))) errors.push(`${f}: dead link ${m[1]}`)
  }
}

// One model line (docs/WORKFLOW.md, Models). No other file names a model id: a second table or wording drifts (yskills, 2026-10-07:
// threads kept following an outdated copy).
const modelLine = readFileSync(join(root, 'docs/WORKFLOW.md'), 'utf8').match(/^Models: .*$/m)?.[0]
if (!modelLine) errors.push('docs/WORKFLOW.md: the Models line is missing')
const lineIds = new Set(modelLine?.match(/claude-[a-z]+-[\d-]+/g) ?? [])
const anyText = (d) => readdirSync(join(root, d)).flatMap((n) => {
  const rel = d === '.' ? n : `${d}/${n}`
  if (['.git', 'node_modules', 'research'].includes(n)) return []
  if (statSync(join(root, rel)).isDirectory()) return anyText(rel)
  return /\.(md|mjs|js|json|sh|ya?ml|tsx?)$/.test(n) ? [rel] : []
})
for (const f of anyText('.')) {
  if (f === 'scripts/check.mjs') continue
  const text = readFileSync(join(root, f), 'utf8').split(modelLine ?? '\0').join('')
  for (const id of new Set(text.match(/claude-(?:fable|opus|sonnet|haiku)-[\d-]+/g) ?? [])) {
    const why = lineIds.has(id) ? 'a second copy of a model id' : 'a model id the Models line does not name'
    // CLAUDE.md is a policy file only yskills changes; warn until the paste lands instead of blocking every PR.
    if (f === 'CLAUDE.md') console.warn(`! ${f}: ${why} (${id}); paste the Models line from docs/WORKFLOW.md`)
    else errors.push(`${f}: ${why} (${id}); link the Models line in docs/WORKFLOW.md instead`)
  }
}

if (errors.length) { console.error(errors.map((e) => `x ${e}`).join('\n')); process.exit(1) }
console.log(`ok: ${seen.skill.size} skills, ${seen.agent.size} agents, ${plugins?.global.length ?? 0}+${plugins?.project.length ?? 0} plugins`)
