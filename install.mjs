#!/usr/bin/env node
// yskills' global Claude Code setup. Safe to re-run: it updates what it installed before and
// leaves everything else alone.
//
//   node install.mjs [--dry-run] [--skip-plugins] [--skip-hooks]
//
// What it does, in order:
//   1. backs up ~/.claude/CLAUDE.md and ~/.claude/settings.json
//   2. installs the ECC hook runtime (npx ecc-universal, pinned in config/ecc.json)
//   3. installs plugins from config/plugins.json with the claude CLI
//   4. copies .claude/skills, agents and rules into ~/.claude (curated ECC subset + our own)
//   5. writes CLAUDE.md into the managed block of ~/.claude/CLAUDE.md
//   6. merges global/settings.json into ~/.claude/settings.json
//   7. reports useful command-line tools that are missing (gh, ffmpeg, docker...)
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const SKIP_PLUGINS = args.has('--skip-plugins')
const SKIP_HOOKS = args.has('--skip-hooks')
const IS_WIN = process.platform === 'win32'
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const STATE_DIR = join(CLAUDE_DIR, 'claude-setup')
const MANIFEST = join(STATE_DIR, 'manifest.json')
const START = '<!-- claude-setup:start (managed by yskills/claude-setup; edits inside are overwritten) -->'
const END = '<!-- claude-setup:end -->'

// A folder literally named "~" happens when a shell passes the ~ through (PowerShell did).
const HAS_TILDE_DIR = ROOT.split(/[\\/]/).includes('~')

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback)
const ecc = readJson(join(ROOT, 'config/ecc.json'))
const plugins = readJson(join(ROOT, 'config/plugins.json'))
const log = (m) => console.log(m)
const step = (m) => console.log(`\n== ${m}`)
const warnings = []
const warn = (m) => { warnings.push(m); console.log(`  ! ${m}`) }

function run(cmd, argv, { allowFail = false, quiet = false } = {}) {
  if (DRY) { log(`  (dry run) ${cmd} ${argv.join(' ')}`); return { ok: true, out: '' } }
  const r = spawnSync(cmd, argv, { encoding: 'utf8', shell: IS_WIN, stdio: quiet ? 'pipe' : ['ignore', 'pipe', 'pipe'] })
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim()
  const ok = r.status === 0
  if (!ok && !allowFail) throw new Error(`${cmd} ${argv.join(' ')} failed:\n${out}`)
  return { ok, out }
}
const has = (cmd) => spawnSync(cmd, ['--version'], { encoding: 'utf8', shell: IS_WIN }).status === 0
const write = (p, s) => { if (DRY) return; mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s) }

// ---------------------------------------------------------------- 0. prerequisites
step('Checking prerequisites')
const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor < 20) { console.error(`Node ${process.versions.node} is too old; install Node 20+ (24 recommended).`); process.exit(1) }
log(`  node ${process.versions.node}`)
if (!has('git')) warn('git not found: install Git, then re-run.')
const hasClaude = has('claude')
if (!hasClaude) warn('claude CLI not found: install Claude Code (https://code.claude.com), then re-run to add plugins.')
log(`  config dir ${CLAUDE_DIR}${DRY ? '  (dry run: nothing is written)' : ''}`)

// ---------------------------------------------------------------- 1. backup
step('Backing up current config')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = join(CLAUDE_DIR, 'backups', `claude-setup-${stamp}`)
for (const f of ['CLAUDE.md', 'settings.json']) {
  const p = join(CLAUDE_DIR, f)
  if (existsSync(p)) {
    if (!DRY) { mkdirSync(backupDir, { recursive: true }); cpSync(p, join(backupDir, f)) }
    log(`  ${f} -> ${backupDir}`)
  }
}

// ---------------------------------------------------------------- 2. ECC hooks
step(`ECC hook runtime (${ecc.npmPackage})`)
if (SKIP_HOOKS) log('  skipped (--skip-hooks)')
else {
  const r = run('npx', ['-y', ecc.npmPackage, 'install', '--target', 'claude', '--modules', 'hooks-runtime', '--enable-hooks'], { allowFail: true })
  if (r.ok) log('  installed')
  else warn(`ECC hooks failed (setup continues without them):\n${r.out.split('\n').slice(-5).join('\n')}`)
}

// ---------------------------------------------------------------- 3. plugins
step('Plugins')
const pluginState = {}
if (SKIP_PLUGINS) log('  skipped (--skip-plugins)')
else if (!hasClaude) warn('skipped plugins: no claude CLI')
else {
  for (const m of plugins.marketplaces) {
    const r = run('claude', ['plugin', 'marketplace', 'add', m.source], { allowFail: true, quiet: true })
    log(`  marketplace ${m.name}: ${r.ok ? 'ok' : /already/i.test(r.out) ? 'already added' : 'FAILED'}`)
    if (!r.ok && !/already/i.test(r.out)) warn(`marketplace ${m.source}: ${r.out}`)
    else run('claude', ['plugin', 'marketplace', 'update', m.name], { allowFail: true, quiet: true })
  }
  for (const [group, list] of [['global', plugins.global], ['project', plugins.project]]) {
    for (const p of list) {
      const r = run('claude', ['plugin', 'install', p.id, '--scope', 'user'], { allowFail: true, quiet: true })
      const ok = r.ok || /already installed/i.test(r.out)
      pluginState[p.id] = group === 'global'
      log(`  ${ok ? '+' : 'x'} ${p.id}${group === 'project' ? ' (off until a project enables it)' : ''}`)
      if (!ok) warn(`plugin ${p.id}: ${r.out.split('\n').slice(-2).join(' ')}`)
    }
  }
  // Our own mods (mods/), from this clone as a local marketplace; they show in the terminal and
  // the desktop Code tab, not in cloud project threads.
  const modsDir = join(ROOT, 'mods')
  // shell: true on Windows splits an unquoted path with spaces.
  const mods = run('claude', ['plugin', 'marketplace', 'add', IS_WIN ? `"${modsDir}"` : modsDir], { allowFail: true, quiet: true })
  if (!mods.ok && !/already/i.test(mods.out)) warn(`marketplace mods: ${mods.out}`)
  else run('claude', ['plugin', 'marketplace', 'update', 'claude-setup-mods'], { allowFail: true, quiet: true })
  for (const m of readJson(join(ROOT, 'mods/.claude-plugin/marketplace.json')).plugins) {
    const r = run('claude', ['plugin', 'install', `${m.name}@claude-setup-mods`, '--scope', 'user'], { allowFail: true, quiet: true })
    const ok = r.ok || /already installed/i.test(r.out)
    log(`  ${ok ? '+' : 'x'} mod ${m.name}`)
    if (!ok) warn(`mod ${m.name}: ${r.out.split('\n').slice(-2).join(' ')}`)
  }
}

// ---------------------------------------------------------------- 4. skills, agents, rules
step('Skills, agents and rules')
const prev = readJson(MANIFEST, { files: [] })
const items = []
const listDirs = (p) => (existsSync(p) ? readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory()) : [])
const listMd = (p) => (existsSync(p) ? readdirSync(p).filter((n) => n.endsWith('.md')) : [])
// The repo's own .claude/ folder is the source, so cloud sessions that attach this repo load
// exactly what the installer copies.
for (const n of listDirs(join(ROOT, '.claude/skills'))) items.push([join('.claude/skills', n), join('skills', n)])
for (const n of listMd(join(ROOT, '.claude/agents'))) items.push([join('.claude/agents', n), join('agents', n)])
for (const n of listDirs(join(ROOT, '.claude/rules/ecc'))) items.push([join('.claude/rules/ecc', n), join('rules', 'ecc', n)])
items.push(['licenses/ECC-LICENSE', join('rules', 'ecc', 'LICENSE')])
items.push(['global/statusline.mjs', join('claude-setup', 'statusline.mjs')])
items.push(['global/context-guard.mjs', join('claude-setup', 'context-guard.mjs')])
items.push(['global/attempt-guard.mjs', join('claude-setup', 'attempt-guard.mjs')])
items.push(['global/live-hook.mjs', join('claude-setup', 'live-hook.mjs')])
items.push(['global/team-guard.mjs', join('claude-setup', 'team-guard.mjs')])
items.push(['global/live-shot.ps1', join('claude-setup', 'live-shot.ps1')])

const now = new Set(items.map(([, dest]) => dest))
for (const old of prev.files) {
  if (!now.has(old)) { if (!DRY) rmSync(join(CLAUDE_DIR, old), { recursive: true, force: true }); log(`  - removed ${old}`) }
}
let replacedUserFiles = 0
for (const [src, dest] of items) {
  const target = join(CLAUDE_DIR, dest)
  if (existsSync(target) && !prev.files.includes(dest)) {
    // Something with this name existed before we managed it: keep a copy.
    if (!DRY) { mkdirSync(dirname(join(backupDir, dest)), { recursive: true }); cpSync(target, join(backupDir, dest), { recursive: true }) }
    replacedUserFiles++
  }
  if (!DRY) { rmSync(target, { recursive: true, force: true }); mkdirSync(dirname(target), { recursive: true }); cpSync(join(ROOT, src), target, { recursive: true }) }
}
const count = (prefix) => items.filter(([, d]) => d.startsWith(prefix)).length
log(`  ${count('skills')} skills, ${count('agents')} agents, ${count(join('rules', 'ecc')) - 1} rule packs`)
if (replacedUserFiles) log(`  ${replacedUserFiles} existing file(s) with the same names were backed up to ${backupDir}`)
write(MANIFEST, JSON.stringify({ version: 1, source: ROOT, installedAt: new Date().toISOString(), files: [...now] }, null, 2) + '\n')

// ---------------------------------------------------------------- 5. CLAUDE.md
step('CLAUDE.md')
const claudeMdPath = join(CLAUDE_DIR, 'CLAUDE.md')
const block = `${START}\n${readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8').trim()}\n${END}`
const current = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : ''
const s = current.indexOf(START.slice(0, 26))
const e = current.indexOf(END)
const next = s >= 0 && e > s
  ? current.slice(0, s) + block + current.slice(e + END.length)
  : (current.trim() ? `${block}\n\n${current.trim()}\n` : `${block}\n`)
write(claudeMdPath, next)
log(`  managed block ${s >= 0 ? 'updated' : 'added'}${current.trim() && s < 0 ? ' (your existing notes kept below it)' : ''}`)

// ---------------------------------------------------------------- 6. settings.json
step('settings.json')
const settingsPath = join(CLAUDE_DIR, 'settings.json')
const settings = readJson(settingsPath, {})
const ours = readJson(join(ROOT, 'global/settings.json'))
const union = (a = [], b = []) => [...new Set([...a, ...b])]
function merge(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (Array.isArray(v)) dst[k] = union(dst[k], v)
    else if (v && typeof v === 'object') dst[k] = merge(dst[k] && typeof dst[k] === 'object' ? dst[k] : {}, v)
    else dst[k] = v
  }
  return dst
}
merge(settings, ours)
// A rule we deny must not also be allowed by an older entry.
settings.permissions.allow = settings.permissions.allow.filter((r) => !settings.permissions.deny.includes(r))
settings.statusLine = { type: 'command', command: `node "${join(CLAUDE_DIR, 'claude-setup', 'statusline.mjs')}"`, padding: 0 }
// Context guard (global/context-guard.mjs): one entry, replaced on every install.
settings.hooks ??= {}
const guard = `node "${join(CLAUDE_DIR, 'claude-setup', 'context-guard.mjs')}"`
settings.hooks.PostToolUse = (settings.hooks.PostToolUse ?? []).filter((h) => !JSON.stringify(h).includes('context-guard.mjs'))
settings.hooks.PostToolUse.push({ matcher: '*', hooks: [{ type: 'command', command: guard, timeout: 5 }] })
// Attempt guard (global/attempt-guard.mjs): stops a loop of failing runs; three entries, replaced on every install.
const attempt = (mode) => `node "${join(CLAUDE_DIR, 'claude-setup', 'attempt-guard.mjs')}" ${mode}`
for (const [event, mode, matcher] of [['PreToolUse', 'pre', 'Bash|mcp__.*'], ['PostToolUse', 'ok', 'Bash|mcp__.*'], ['PostToolUseFailure', 'fail', 'Bash|mcp__.*']]) {
  settings.hooks[event] = (settings.hooks[event] ?? []).filter((h) => !JSON.stringify(h).includes('attempt-guard.mjs'))
  settings.hooks[event].push({ matcher, hooks: [{ type: 'command', command: attempt(mode), timeout: 5 }] })
}
// Team guard (global/team-guard.mjs): a docs/TEAMS.md pointer at session start and a block on Agent calls and thread starts without `model`; one entry each, replaced on every install.
const team = (mode) => ({ type: 'command', command: `node "${join(CLAUDE_DIR, 'claude-setup', 'team-guard.mjs')}" ${mode}`, timeout: 5 })
for (const [event, matcher, mode] of [['SessionStart', 'startup|clear|compact', 'start'], ['PreToolUse', 'Agent|Task|mcp__.*start_thread.*|mcp__.*create_session', 'pre']]) {
  settings.hooks[event] = (settings.hooks[event] ?? []).filter((h) => !/team-(brief|guard)\.mjs/.test(JSON.stringify(h)))
  settings.hooks[event].push({ matcher, hooks: [team(mode)] })
}
// Live frames of Roblox Studio and Blender for HQ (global/live-hook.mjs, studio skill): one entry, replaced on every install.
settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter((h) => !JSON.stringify(h).includes('live-hook.mjs'))
settings.hooks.PostToolUse.push({ matcher: 'mcp__Roblox_Studio__.*|mcp__Blender__.*', hooks: [{ type: 'command', command: `node "${join(CLAUDE_DIR, 'claude-setup', 'live-hook.mjs')}"`, timeout: 5 }] })
settings.env ??= {}
if (!SKIP_HOOKS) {
  settings.env.ECC_HOOK_PROFILE = ecc.hooks.profile
  settings.env.ECC_GATEGUARD = 'off'
  settings.env.ECC_DISABLED_HOOKS = union((settings.env.ECC_DISABLED_HOOKS || '').split(',').filter(Boolean), ecc.hooks.disabled).join(',')
}
settings.extraKnownMarketplaces ??= {}
for (const m of plugins.marketplaces) {
  const [owner, repo] = m.source.split('/')
  settings.extraKnownMarketplaces[m.name] ??= { source: { source: 'github', repo: `${owner}/${repo}` } }
}
settings.enabledPlugins ??= {}
for (const p of plugins.global) settings.enabledPlugins[p.id] = true
for (const p of plugins.project) settings.enabledPlugins[p.id] = false
for (const p of plugins.retired ?? []) if (settings.enabledPlugins[p.id]) settings.enabledPlugins[p.id] = false
// The full ECC plugin would load ~45k tokens per session on top of the curated copy.
if (settings.enabledPlugins['ecc@ecc']) { settings.enabledPlugins['ecc@ecc'] = false; warn('turned off the full ecc@ecc plugin: this setup installs a curated part of it instead') }
write(settingsPath, JSON.stringify(settings, null, 2) + '\n')
log(`  merged (permissions mode: ${settings.permissions.defaultMode}, ${Object.values(settings.enabledPlugins).filter(Boolean).length} plugins on)`)

// ---------------------------------------------------------------- 7. tools on this machine
step('Command-line tools (checked, not installed)')
const TOOLS = [
  ['gh', 'GitHub CLI: PRs, CI status', { win: 'winget install GitHub.cli', mac: 'brew install gh', linux: 'see https://cli.github.com' }],
  ['ffmpeg', 'video and audio processing', { win: 'winget install Gyan.FFmpeg', mac: 'brew install ffmpeg', linux: 'sudo apt install ffmpeg' }],
  ['docker', 'containers (Luna, local services)', { win: 'winget install Docker.DockerDesktop', mac: 'brew install --cask docker', linux: 'curl -fsSL https://get.docker.com | sh' }],
  ['python3', 'Python scripts and AI tools', { win: 'winget install Python.Python.3.13', mac: 'brew install python', linux: 'sudo apt install python3' }],
  ['uv', 'fast Python package manager', { win: 'winget install astral-sh.uv', mac: 'brew install uv', linux: 'curl -LsSf https://astral.sh/uv/install.sh | sh' }],
  ['fnm', 'Node version per project (.node-version)', { win: 'winget install Schniz.fnm', mac: 'brew install fnm', linux: 'curl -fsSL https://fnm.vercel.app/install | bash' }],
]
const os = IS_WIN ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
const missingTools = []
for (const [cmd, what, hint] of TOOLS) {
  const found = has(cmd) || (cmd === 'python3' && has('python')) || (cmd === 'ffmpeg' && spawnSync('ffmpeg', ['-version'], { shell: IS_WIN }).status === 0)
  log(`  ${found ? '+' : '-'} ${cmd.padEnd(8)} ${what}`)
  if (!found) missingTools.push(`${hint[os]}`)
}
if (missingTools.length) log(`  Install the missing ones with:\n    ${missingTools.join('\n    ')}`)

// ---------------------------------------------------------------- done
step(DRY ? 'Dry run finished' : 'Done')
if (HAS_TILDE_DIR) {
  const fix = IS_WIN ? '$HOME' : '~'
  log(`WARNING: this clone sits in a folder literally named "~" (${ROOT}).
Move it and update with the real home folder:
  ${IS_WIN ? 'Move-Item' : 'mv'} "${ROOT}" "${join(homedir(), 'claude-setup')}"
  git -C ${fix}/claude-setup pull; node ${fix}/claude-setup/install.mjs`)
}
if (warnings.length) { log(`${warnings.length} warning(s):`); for (const w of warnings) log(`  - ${w.split('\n')[0]}`) }
log(`Start a new Claude Code session (or run /reload-plugins) to load everything.
Backup of your previous config: ${existsSync(backupDir) ? backupDir : '(nothing to back up)'}
Update later with: git -C "${ROOT}" pull && node "${join(ROOT, 'install.mjs')}"`)
