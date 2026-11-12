#!/usr/bin/env node
// M28 (plan 2026-11-12-M28-short-plan.md): the task ledger. A task's PLAN.md, its plan check and its approval are three fields of the same
// per-asset ledger file the gate round counter keeps (gate-rounds.mjs); planReady() is the one function lock B (M42) will call.
// The plan check is written only by the door (recordPlanCheck, called by the hook); the CLI has no verb for it.
// CLI: task-ledger.mjs plan <asset> <PLAN.md> | approve <asset> <ref> | status <asset>
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cardProof, ledgerDir, readLedger, writeLedger } from './gate-rounds.mjs'

const sha = (text) => createHash('sha256').update(text).digest('hex')
const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }

// ---- the structure check of a PLAN.md (docs/templates/task-plan.md); scripts/task-plan-check.mjs is its CLI
const SECTIONS = [
  ['Goal', /^(goal|ziel)$/i], ['References', /^(references|referenzen)$/i], ['Method', /^(method|methode)$/i], ['Risks', /^(risks|risiken)$/i],
  ['Acceptance', /^(acceptance|kriterien)$/i], ['Gate point', /^(gate point|gate-punkt)$/i], ['Still needed', /^(still needed|ich brauche noch)$/i],
]
const PLACEHOLDER = /^\s*(?:[-*]\s*)?<[^>]*>\s*$/ // a template line that nobody filled in
const CARD = /\bcmsg_\w+/
const VIEW = /\b(view|views|camera|screen|screenshot|frame|frames|shot|crop|ansicht|kamera|bild)\b/i
const AGAINST = /(?:against|vs\.?|gegen|compared with|verglichen mit)\s+\S+/i
const MEASURED = /\d|`[^`]+`/
const NOTHING = /^\s*(nothing|nichts)\.?\s*$/i

// Splits at `## ` headings (levels 1 to 2); a `###` line stays inside its section.
function sections(text) {
  const out = {}
  let name = null
  for (const line of text.split('\n')) {
    const h = line.match(/^##?\s+(.*?)\s*$/)
    if (h && !line.startsWith('###')) { name = SECTIONS.find(([, re]) => re.test(h[1]))?.[0] ?? null; if (name) out[name] = []; continue }
    if (name) out[name].push(line)
  }
  return out
}
const items = (lines) => lines.filter((l) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(l) && !PLACEHOLDER.test(l)).map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))
const filled = (lines) => lines.some((l) => l.trim() && !PLACEHOLDER.test(l) && !/^#{3,}/.test(l.trim()))

export function checkPlan(text, { topic = null } = {}) {
  const gaps = []
  const s = sections(String(text))
  for (const [name] of SECTIONS) if (!s[name] || !filled(s[name])) gaps.push(`${name}: section missing or empty`)
  if (s.References && filled(s.References)) {
    if (!items(s.References).some((l) => /^MAIN\b/.test(l))) gaps.push('References: one line starts with MAIN (the reference everything is compared with)')
    if (/^(hud|look)\b/i.test(topic ?? '') && !CARD.test(s.References.join('\n'))) gaps.push('References: a hud or look task carries the reference card link (cmsg_...)')
  }
  if (s.Acceptance && filled(s.Acceptance)) {
    const lists = { measured: [], eye: [] }
    let cur = null
    for (const l of s.Acceptance) {
      if (/^#{3,}\s*(measured|gemessen)\b|^\**(measured|gemessen)\**:?\s*$/i.test(l.trim())) cur = 'measured'
      else if (/^#{3,}\s*(by eye|nach sicht|sichtliste)\b|^\**(by eye|nach sicht|sichtliste)\**:?\s*$/i.test(l.trim())) cur = 'eye'
      else if (cur) lists[cur].push(l)
    }
    const measured = items(lists.measured)
    const eye = items(lists.eye)
    if (!measured.length) gaps.push('Acceptance: a Measured list is required (every line holds a number, a unit or a command in backticks)')
    for (const m of measured) if (!MEASURED.test(m)) gaps.push(`Acceptance, Measured: no number, unit or command in "${m.slice(0, 50)}"`)
    if (!eye.length) gaps.push('Acceptance: a By eye list is required (every line names the view and what it is compared with)')
    for (const e of eye) if (!(VIEW.test(e) && AGAINST.test(e))) gaps.push(`Acceptance, By eye: name the view and the reference ("<view> against <reference>") in "${e.slice(0, 50)}"`)
  }
  if (s['Gate point'] && filled(s['Gate point'])) {
    const g = s['Gate point'].join('\n')
    for (const key of ['Asset', 'Topic']) if (!new RegExp(`^\\s*${key}:[ \\t]*(?!<)\\S`, 'im').test(g)) gaps.push(`Gate point: a "${key}: <value>" line is required`)
  }
  if (s['Still needed'] && filled(s['Still needed'])) {
    const body = s['Still needed'].filter((l) => l.trim() && !PLACEHOLDER.test(l))
    if (!items(s['Still needed']).length && !(body.length === 1 && NOTHING.test(body[0]))) gaps.push('Still needed: a list, or the word nothing')
  }
  return gaps
}

// ---- the ledger fields
const topicOf = (planText) => String(planText).match(/^\s*Topic:[ \t]*(\S[^\n]*)/im)?.[1].trim() ?? null

export function registerPlan(asset, planPath, session, dir = ledgerDir()) {
  const text = read(planPath)
  const gaps = checkPlan(text, { topic: topicOf(text) })
  if (gaps.length) throw new Error(`${planPath} fails the plan check: ${gaps.join('; ')}`)
  const l = readLedger(dir, asset)
  writeLedger(dir, { ...l, plan: { path: planPath, hash: sha(text), author_session: session ?? null, at: new Date().toISOString() } })
}
// Called by the door (the hook), never by the author: the hash must be the registered plan's, the result pass or fail.
export function recordPlanCheck(asset, { result, plan_hash: planHash, brief_hash: briefHash, model }, dir = ledgerDir()) {
  const l = readLedger(dir, asset)
  if (!l.plan) throw new Error(`${asset} has no registered plan`)
  if (planHash !== l.plan.hash) throw new Error(`plan check for ${planHash}, which is not the registered plan of ${asset}`)
  if (!['pass', 'fail'].includes(result)) throw new Error('a plan check result is pass or fail')
  writeLedger(dir, { ...l, planCheck: { result, plan_hash: planHash, brief_hash: briefHash, model, at: new Date().toISOString() } })
}
export function recordApproval(asset, { by, ref }, dir = ledgerDir()) {
  const l = readLedger(dir, asset)
  if (!l.plan || l.planCheck?.result !== 'pass' || l.planCheck.plan_hash !== l.plan.hash) throw new Error(`${asset}: approval needs a passed plan check for the current plan (it has none)`)
  writeLedger(dir, { ...l, approval: { by, ref, plan_hash: l.plan.hash, at: new Date().toISOString() } })
}
export function planReady(asset, dir = ledgerDir()) {
  const l = readLedger(dir, asset)
  const h = l.plan?.hash
  return !!h && sha(read(l.plan.path)) === h && l.planCheck?.result === 'pass' && l.planCheck.plan_hash === h && l.approval?.plan_hash === h
}

// Which approval proof applies comes from the registered plan's Gate point and the brief's Size, never from an argument the thread passes (plan section 8).
export const visibleWork = (planText, size) => size === 'L' || !/^(none|nichts)\b/i.test(topicOf(planText) ?? 'none')
// Visible work: yskills' card, posted by this session (the round counter's proof). Pure code at M: the coordinator's message is in the session after the check.
export function approvalProblem({ visible, ref, calls = [], humanAfter = () => false }) {
  if (visible) return cardProof(ref, calls) ? null : `approval of visible work needs ${ref ?? 'a card'}, a request_decision card to yskills that this session posted (not found in this session)`
  return humanAfter(ref) ? null : `approval of pure code needs the coordinator message ${ref ?? ''} in this session after the plan check (not found)`
}

export function cli(argv, env = process.env) {
  const [cmd, asset, arg] = argv
  if (!['plan', 'approve', 'status'].includes(cmd) || !asset) return { code: 1, text: 'usage: task-ledger.mjs plan <asset> <PLAN.md> | approve <asset> <cmsg id> | status <asset>' }
  const dir = ledgerDir(env)
  try {
    if (cmd === 'plan') { if (!arg || !existsSync(arg)) return { code: 2, text: 'plan: a PLAN.md path is required' }; registerPlan(asset, arg, env.CLAUDE_CODE_SESSION_ID ?? null, dir); return { code: 0, text: `registered ${asset}` } }
    if (cmd === 'approve') { recordApproval(asset, { by: 'cli', ref: arg }, dir); return { code: 0, text: `approved ${asset}` } }
    const l = readLedger(dir, asset)
    return { code: 0, text: JSON.stringify({ asset, plan: l.plan ?? null, planCheck: l.planCheck ?? null, approval: l.approval ?? null, planReady: planReady(asset, dir) }, null, 2) }
  } catch (e) { return { code: 2, text: `${cmd}: ${e.message}` } }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const { code, text } = cli(process.argv.slice(2))
  ;(code ? process.stderr : process.stdout).write(`${text}\n`)
  process.exitCode = code
}
