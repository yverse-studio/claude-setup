#!/usr/bin/env node
// Validates the repo: JSON parses, every skill and agent has name/description frontmatter,
// every name is unique, the vendored ECC subset matches config/ecc.json, own skill descriptions
// are short and say when to use them, own agents cap their turns, and every never/always rule
// names its guard or is tagged advisory.
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

// Own skills and agents (the ECC subset is vendored and never hand-edited). A long description gets
// cut by the skill-listing budget and the trigger words at its end are lost; an agent without
// maxTurns can loop until the context is gone (benchmark 2026-10-18, complaints 3 and 7).
const DESC_MAX = 200 // short enough that nothing is cut, whatever the listing budget is
const TURNS_MAX = 100
const descriptionOf = (file) => {
  const raw = frontmatter(join(root, file))?.description ?? ''
  try { return JSON.parse(raw) } catch { return raw.replace(/^['"]|['"]$/g, '') }
}
for (const n of dirs('.claude/skills')) {
  if ((ecc?.skills ?? []).includes(n)) continue
  const file = `.claude/skills/${n}/SKILL.md`
  const d = descriptionOf(file)
  if (d.length > DESC_MAX) errors.push(`${file}: description is ${d.length} characters, the cap is ${DESC_MAX}; put the "Use when ..." trigger words first and cut the rest`)
  if (d && !/\bUse\b/.test(d)) errors.push(`${file}: description has no "Use when/for ..." sentence naming what makes it fire`)
}
for (const f of mds('.claude/agents')) {
  const n = f.replace(/\.md$/, '')
  if ((ecc?.agents ?? []).includes(n)) continue
  const turns = frontmatter(join(root, '.claude/agents', f))?.maxTurns
  if (!/^\d+$/.test(turns ?? '') || Number(turns) < 1 || Number(turns) > TURNS_MAX) errors.push(`.claude/agents/${f}: own agents need maxTurns between 1 and ${TURNS_MAX} in the frontmatter`)
}

// Hooks come from install.mjs only. A hooks block in a settings file the install copies, or in the
// repo's own, fires a second time next to the installed one (claude-code #3465, #9602).
for (const p of ['global/settings.json', '.claude/settings.json']) {
  if (Object.keys(json(p)?.hooks ?? {}).length) errors.push(`${p}: no hooks here; install.mjs registers them (scripts/guards.test.mjs checks them)`)
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

// One model line (docs/WORKFLOW.md, Models); no other file names a model id. A second table or
// wording drifts (yskills, 2026-10-07: threads kept following an outdated copy).
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

// Rule enforcement: a "never" or "always" rule that only lives in prose is advisory. Each such
// bullet in these files says so with [advisory], or names the guard that enforces it:
// [guard: deny <rule>], [guard: ask <rule>] (a rule in global/settings.json), [guard: test <file>]
// or [guard: hook <file>] (the file exists). Tables and code blocks are skipped. Other own skills are
// not linted yet; add them here when their lines are tagged.
const RULE_FILES = ['CLAUDE.md', '.claude/skills/operator/SKILL.md', '.claude/skills/publish/SKILL.md']
const ruleItems = (text) => {
  const out = []
  let cur = null
  let fence = false
  text.split('\n').forEach((l, i) => {
    if (/^```/.test(l)) { fence = !fence; cur = null; return }
    if (fence) return
    if (/^\s{0,1}(?:[-*]|\d+\.)\s/.test(l)) { cur = { line: i + 1, text: l }; out.push(cur) }
    else if (/^\s+\S/.test(l) && cur) cur.text += ` ${l.trim()}`
    else if (/^\s*$|^#|^\|/.test(l)) cur = null
    else { cur = { line: i + 1, text: l }; out.push(cur) }
  })
  return out
}
const gSettings = json('global/settings.json')?.permissions ?? {}
for (const f of RULE_FILES) {
  const text = readFileSync(join(root, f), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---/, (m) => m.replace(/[^\n]/g, ''))
  for (const it of ruleItems(text)) {
    if (!/\b(never|always)\b/i.test(it.text)) continue
    const tag = it.text.match(/\[(advisory|guard: ([a-z]+) ([^\]]+))\]/)
    if (!tag) { errors.push(`${f}:${it.line}: a never/always rule without [advisory] or [guard: ...]: ${it.text.slice(0, 70)}`); continue }
    if (tag[1] === 'advisory') continue
    const [, , kind, target] = tag
    const ok = kind === 'deny' ? (gSettings.deny ?? []).includes(target)
      : kind === 'ask' ? (gSettings.ask ?? []).includes(target)
        : kind === 'test' || kind === 'hook' ? existsSync(join(root, target))
          : false
    if (!ok) errors.push(`${f}:${it.line}: guard "${kind} ${target}" does not exist (deny/ask: a rule in global/settings.json; test/hook: a file)`)
  }
}

// The review format has one home (reviewer.md, Report); the own reviewer agents must carry its "Not judged" part.
const reviewerRole = readFileSync(join(root, '.claude/skills/operator/roles/reviewer.md'), 'utf8')
for (const part of ['Quote the line', 'Would a test fail', 'Not judged:']) {
  if (!reviewerRole.includes(part)) errors.push(`roles/reviewer.md: Report lacks "${part}"`)
}
for (const a of ['design-critic', 'legal-reviewer', 'red-team']) {
  if (!/Not judged:/.test(readFileSync(join(root, `.claude/agents/${a}.md`), 'utf8'))) errors.push(`agents/${a}.md: report format lacks "Not judged:"`)
}

// Research method: one home (roles/researcher.md, Method); the report template keeps its checkable parts.
const researcherRole = readFileSync(join(root, '.claude/skills/operator/roles/researcher.md'), 'utf8')
for (const part of ['Primary sources only', 'Every claim carries its source', 'Describe before judging', 'Numbers only as read', 'Not checked:']) {
  if (!researcherRole.includes(part)) errors.push(`roles/researcher.md: Method lacks "${part}"`)
}
const researchTemplate = readFileSync(join(root, '.claude/skills/operator/templates/research.md'), 'utf8')
for (const part of ['## 6. Sources', 'Not checked:']) {
  if (!researchTemplate.includes(part)) errors.push(`templates/research.md: lacks "${part}"`)
}

// Game design doc: one home (roles/game-designer.md); the template must carry every heading gdd-check.mjs requires.
const { REQUIRED_HEADINGS } = await import('../.claude/skills/game-3d/scripts/gdd-check.mjs')
const designerRole = readFileSync(join(root, '.claude/skills/operator/roles/game-designer.md'), 'utf8')
for (const part of ['## Method', '## Bar', 'gdd-check.mjs', 'What it is NOT']) {
  if (!designerRole.includes(part)) errors.push(`roles/game-designer.md: lacks "${part}"`)
}
const gddTemplate = readFileSync(join(root, '.claude/skills/operator/templates/game-design.md'), 'utf8')
for (const h of REQUIRED_HEADINGS) {
  if (!new RegExp(`^## ${h}\\s*$`, 'm').test(gddTemplate)) errors.push(`templates/game-design.md: lacks "## ${h}"`)
}

// Sound doc: one home (roles/audio.md); the template must carry every heading audio-check.mjs requires.
const { REQUIRED_HEADINGS: AUDIO_HEADINGS } = await import('../.claude/skills/game-3d/scripts/audio-check.mjs')
const audioRole = readFileSync(join(root, '.claude/skills/operator/roles/audio.md'), 'utf8')
for (const part of ['## Method', '## Bar', 'audio-check.mjs', 'What it is NOT']) {
  if (!audioRole.includes(part)) errors.push(`roles/audio.md: lacks "${part}"`)
}
const audioTemplate = readFileSync(join(root, '.claude/skills/operator/templates/audio.md'), 'utf8')
for (const h of AUDIO_HEADINGS) {
  if (!new RegExp(`^## ${h}\\s*$`, 'm').test(audioTemplate)) errors.push(`templates/audio.md: lacks "## ${h}"`)
}

// Copy deck: one home (roles/content-designer.md); the template must carry every heading copy-check.mjs requires.
const { REQUIRED_HEADINGS: COPY_HEADINGS } = await import('../.claude/skills/ui-review/scripts/copy-check.mjs')
const contentRole = readFileSync(join(root, '.claude/skills/operator/roles/content-designer.md'), 'utf8')
for (const part of ['## Method', '## Bar', 'copy-check.mjs', 'Terms table']) {
  if (!contentRole.includes(part)) errors.push(`roles/content-designer.md: lacks "${part}"`)
}
const copyTemplate = readFileSync(join(root, '.claude/skills/operator/templates/copy-deck.md'), 'utf8')
for (const h of COPY_HEADINGS) {
  if (!new RegExp(`^## ${h}\\s*$`, 'm').test(copyTemplate)) errors.push(`templates/copy-deck.md: lacks "## ${h}"`)
}

// Tracking plan: one home (roles/analytics.md); the template must carry every heading analytics-check.mjs requires.
const { REQUIRED_HEADINGS: TRACKING_HEADINGS, checkRoleDoc } = await import('../.claude/skills/market/scripts/analytics-check.mjs')
const analyticsRole = readFileSync(join(root, '.claude/skills/operator/roles/analytics.md'), 'utf8')
for (const part of ['## Method', '## Bar', '## Tools', 'analytics-check.mjs', 'Weekly numbers line']) {
  if (!analyticsRole.includes(part)) errors.push(`roles/analytics.md: lacks "${part}"`)
}
errors.push(...checkRoleDoc(analyticsRole))
const trackingTemplate = readFileSync(join(root, '.claude/skills/operator/templates/tracking-plan.md'), 'utf8')
for (const h of TRACKING_HEADINGS) {
  if (!new RegExp(`^## ${h}\\s*$`, 'm').test(trackingTemplate)) errors.push(`templates/tracking-plan.md: lacks "## ${h}"`)
}

if (errors.length) { console.error(errors.map((e) => `x ${e}`).join('\n')); process.exit(1) }
console.log(`ok: ${seen.skill.size} skills, ${seen.agent.size} agents, ${plugins?.global.length ?? 0}+${plugins?.project.length ?? 0} plugins`)
