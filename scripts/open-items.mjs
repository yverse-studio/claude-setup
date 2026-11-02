#!/usr/bin/env node
// One overview "Was ist offen" across all projects: the `## Jetzt` block of every repo's PROGRESS.md,
// open PRs and `ceo` issues of the org, and the job files in ~/.claude/jobs.
// Run: node scripts/open-items.mjs [--md] [--html [file]] [--root <dir>] [--jobs <dir>] [--no-gh]
// Writes ~/.claude/open-items.md on every run with gh (opencode.json loads it as an instruction file).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ORG = 'yverse-studio'
const MAX_MD_LINES = 60
const MAX_PRS = 12
const STALE_DAYS = 14
const MONEY = /geld|umsatz|revenue|stripe|€|\beur\b|go-live|zahlung|money/i

// Pure: the `## Jetzt` block of a PROGRESS.md (docs/hq-rows.md) as data, or null when there is none.
export function extractJetzt(text) {
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/)
  const start = lines.findIndex((l) => /^##\s+Jetzt\s*$/i.test(l))
  if (start < 0) return null
  const block = []
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(l)) break
    block.push(l)
  }
  const out = { ziel: '', offen: [], wartet: [], stand: '', raw: block.join('\n').trim() }
  let list = null
  for (const l of block) {
    const head = l.match(/^(Ziel|Offen|Wartet auf dich|Stand):\s*(.*)$/i)
    if (head) {
      const key = head[1].toLowerCase()
      const rest = head[2].trim()
      list = null
      if (key === 'ziel') out.ziel = rest
      else if (key === 'stand') out.stand = rest
      else {
        list = key === 'offen' ? out.offen : out.wartet
        if (rest) list.push(rest)
      }
      continue
    }
    const item = l.match(/^\s*[-*]\s+(.*\S)\s*$/)
    if (item && list) list.push(item[1])
  }
  out.wartet = out.wartet.filter((w) => !/^nichts\.?$/i.test(w))
  out.money = MONEY.test(out.raw)
  return out
}

export function daysSince(stand, now = new Date()) {
  const m = String(stand ?? '').match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return Math.floor((now - new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))) / 86400000)
}

export function jobTitle(text) {
  const first = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim())
  return first ? first.replace(/^#+\s*/, '').trim() : ''
}

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 30000 })
  return r.error || r.status !== 0 ? null : r.stdout
}

function readRepos(root) {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((n) => existsSync(join(root, n, '.git')))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const dir = join(root, name)
      const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], dir)?.trim() ?? '?'
      const changes = run('git', ['status', '--porcelain'], dir)?.split('\n').filter(Boolean).length ?? 0
      const pf = join(dir, 'PROGRESS.md')
      const jetzt = existsSync(pf) ? extractJetzt(readFileSync(pf, 'utf8')) : null
      return { name, branch, changes, jetzt, label: name === 'claude-setup-luna2' ? 'Luna-2-Klon von claude-setup' : '' }
    })
}

function ghJson(args) {
  const out = run('gh', args)
  if (out === null) return null
  try { return JSON.parse(out) } catch { return null }
}

function readJobs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md') && statSync(join(dir, n)).isFile())
    .map((n) => ({ file: n, title: jobTitle(readFileSync(join(dir, n), 'utf8')) || n }))
}

export function collect({ root, jobsDir, gh = true }) {
  const prs = gh ? ghJson(['search', 'prs', '--owner', ORG, '--state', 'open', '--limit', '100', '--json', 'repository,number,title,url,isDraft,updatedAt']) : null
  const issues = gh ? ghJson(['search', 'issues', '--owner', ORG, '--label', 'ceo', '--state', 'open', '--limit', '50', '--json', 'repository,number,title,url']) : null
  return { at: new Date(), repos: readRepos(root), prs, issues, jobs: readJobs(jobsDir), ghOk: { prs: prs !== null, issues: issues !== null } }
}

const stamp = (d) => d.toLocaleString('sv-SE').slice(0, 16)
const repoName = (x) => x.repository?.name ?? x.repository?.nameWithOwner?.split('/')[1] ?? '?'
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// Money projects first, then the ones with something waiting on yskills, then the rest.
function ordered(repos) {
  const rank = (r) => (r.jetzt?.money ? 0 : r.jetzt?.wartet.length ? 1 : r.jetzt ? 2 : 3)
  return [...repos].sort((a, b) => rank(a) - rank(b))
}

export function toMarkdown(data) {
  const L = []
  const withJetzt = ordered(data.repos).filter((r) => r.jetzt)
  const without = data.repos.filter((r) => !r.jetzt)
  L.push(`# Was ist offen (Stand ${stamp(data.at)})`)
  const money = withJetzt.filter((r) => r.jetzt.money)
  if (money.length) {
    L.push('', '## Geld zuerst')
    for (const r of money) L.push(`- **${r.name}**: ${short(r.jetzt.ziel || r.jetzt.offen[0] || '', 110)}`)
  }
  const waits = withJetzt.filter((r) => r.jetzt.wartet.length)
  if (waits.length) {
    L.push('', '## Wartet auf dich')
    for (const r of waits) L.push(`- **${r.name}**: ${short(r.jetzt.wartet.join('; '), 130)}`)
  }
  L.push('', '## ceo-Aufträge')
  if (data.issues === null) L.push('- nicht geprüft (gh fehlgeschlagen)')
  else if (!data.issues.length) L.push('- keine')
  else for (const i of data.issues) L.push(`- ${repoName(i)}#${i.number} ${short(i.title, 90)}`)
  const prs = data.prs
  L.push('', `## Offene PRs${prs ? ` (${prs.length})` : ''}`)
  if (prs === null) L.push('- nicht geprüft (gh fehlgeschlagen)')
  else if (!prs.length) L.push('- keine')
  else {
    const sorted = [...prs].sort((a, b) => Number(a.isDraft) - Number(b.isDraft) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    for (const p of sorted.slice(0, MAX_PRS)) L.push(`- ${repoName(p)}#${p.number}${p.isDraft ? ' (Entwurf)' : ''} ${short(p.title, 80)}`)
    if (sorted.length > MAX_PRS) L.push(`- … ${sorted.length - MAX_PRS} weitere in der HTML-Seite`)
  }
  L.push('', `## Jobs (${data.jobs.length})`)
  if (!data.jobs.length) L.push('- keine')
  else for (const j of data.jobs) L.push(`- ${short(j.title, 100)}`)
  L.push('', '## Projekte')
  for (const r of withJetzt) {
    const age = daysSince(r.jetzt.stand, data.at)
    const old = age !== null && age > STALE_DAYS ? `, Stand ${r.jetzt.stand} (alt)` : ''
    L.push(`- **${r.name}** (${r.branch}${r.changes ? `, ${r.changes} ungespeichert` : ''}${old}): ${short(r.jetzt.ziel, 90)}`)
    if (r.jetzt.offen.length) L.push(`  - offen (${r.jetzt.offen.length}): ${short(r.jetzt.offen[0], 100)}`)
  }
  if (without.length) {
    L.push(`- Ohne Jetzt-Block: ${without.map((r) => `${r.name} (${r.branch}${r.changes ? `, ${r.changes}±` : ''})`).join(', ')}`)
  }
  if (L.length > MAX_MD_LINES) {
    const cut = L.length - (MAX_MD_LINES - 1)
    L.length = MAX_MD_LINES - 1
    L.push(`… ${cut} weitere Zeilen, siehe die HTML-Seite (scripts/open-items.cmd)`)
  }
  return L.join('\n') + '\n'
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const safeUrl = (u) => (/^https:\/\//.test(u) ? esc(u) : '#')

export function toHtml(data) {
  const ul = (items) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '<p class="muted">nichts</p>')
  const warn = (what) => `<p class="warn">nicht geprüft: ${what} (gh fehlgeschlagen)</p>`
  const prList = data.prs === null ? warn('PRs')
    : ul(data.prs.map((p) => `<a href="${safeUrl(p.url)}">${esc(repoName(p))}#${p.number}</a> ${p.isDraft ? '<span class="tag">Entwurf</span> ' : ''}${esc(p.title)}`))
  const issueList = data.issues === null ? warn('ceo-Aufträge')
    : ul(data.issues.map((i) => `<a href="${safeUrl(i.url)}">${esc(repoName(i))}#${i.number}</a> ${esc(i.title)}`))
  const cards = ordered(data.repos).map((r) => {
    const j = r.jetzt
    const age = j ? daysSince(j.stand, data.at) : null
    const old = age !== null && age > STALE_DAYS
    const meta = `${esc(r.branch)}${r.changes ? ` · ${r.changes} ungespeichert` : ''}${r.label ? ` · ${esc(r.label)}` : ''}`
    const body = j
      ? `<p class="ziel">${esc(j.ziel)}</p>${j.offen.length ? `<h4>Offen</h4>${ul(j.offen.map(esc))}` : ''}${j.wartet.length ? `<h4 class="pink">Wartet auf dich</h4>${ul(j.wartet.map(esc))}` : ''}<p class="muted${old ? ' warn' : ''}">Stand ${esc(j.stand || '?')}${old ? ' (alt)' : ''}</p>`
      : '<p class="muted">kein Jetzt-Block in PROGRESS.md</p>'
    return `<section class="card${j?.money ? ' money' : ''}"><h3>${esc(r.name)}${j?.money ? ' <span class="tag">Geld</span>' : ''}</h3><p class="muted">${meta}</p>${body}</section>`
  }).join('\n')
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="300"><title>Luna Übersicht: was ist offen</title>
<style>
:root{color-scheme:dark;--bg:#14101c;--card:#1f1830;--line:#3a2d57;--text:#efe9fb;--muted:#a597c4;--pink:#f7a8d0;--purple:#b79cf0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,Segoe UI,sans-serif;padding:24px;max-width:1200px;margin-inline:auto}
h1{font-size:1.6rem;margin:0 0 4px;background:linear-gradient(90deg,var(--pink),var(--purple));-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:1.1rem;color:var(--purple);margin:28px 0 10px}h3{margin:0;font-size:1.05rem}h4{margin:12px 0 2px;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--purple)}
a{color:var(--pink)}a:hover{color:#fff}ul{margin:4px 0;padding-left:20px}li{margin:3px 0}
.muted{color:var(--muted);font-size:.85rem;margin:2px 0}.warn{color:#ffb86b}.pink{color:var(--pink)}.ziel{margin:8px 0 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}.card.money{border-color:var(--pink);box-shadow:0 0 0 1px var(--pink) inset}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px 16px 10px}
.tag{font-size:.7rem;padding:1px 7px;border-radius:99px;background:var(--line);color:var(--pink);vertical-align:middle}
@media(prefers-reduced-motion:no-preference){a{transition:color .15s}}
</style></head><body>
<h1>Was ist offen</h1><p class="muted">erzeugt ${esc(stamp(data.at))} · lädt alle 5 Minuten neu</p>
<h2>ceo-Aufträge</h2><div class="panel">${issueList}</div>
<h2>Offene PRs${data.prs ? ` (${data.prs.length})` : ''}</h2><div class="panel">${prList}</div>
<h2>Jobs (${data.jobs.length})</h2><div class="panel">${ul(data.jobs.map((j) => esc(j.title)))}</div>
<h2>Projekte</h2><div class="grid">
${cards}
</div></body></html>
`
}

function parseArgs(argv) {
  const o = { md: false, html: null, gh: true, root: join(homedir(), 'Documents', 'GitHub'), jobs: join(homedir(), '.claude', 'jobs') }
  const defaultHtml = join(homedir(), '.claude', 'open-items.html')
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--md') o.md = true
    else if (a === '--no-gh') o.gh = false
    else if (a === '--root') o.root = resolve(argv[++i])
    else if (a === '--jobs') o.jobs = resolve(argv[++i])
    else if (a === '--html') o.html = argv[i + 1] && !argv[i + 1].startsWith('--') ? resolve(argv[++i]) : defaultHtml
  }
  if (!o.md && !o.html) { o.md = true; o.html = defaultHtml }
  return o
}

function write(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf8')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parseArgs(process.argv.slice(2))
  const data = collect({ root: o.root, jobsDir: o.jobs, gh: o.gh })
  const md = toMarkdown(data)
  if (o.gh) write(join(homedir(), '.claude', 'open-items.md'), md)
  if (o.html) write(o.html, toHtml(data))
  if (o.md) process.stdout.write(md)
  else if (o.html) console.log(`geschrieben: ${o.html}`)
}
