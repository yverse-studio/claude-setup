#!/usr/bin/env node
// The project's one living plan, PLAN.json (roles/project-manager.md, Masterplan). Threads change it only
// through this script, so the JSON never breaks and the rules hold: done needs evidence, wartet names what it
// waits on, drop says why, ids are unique. The coordinator only reads the file.
// Usage: node scripts/plan.mjs init goal=<text> | goal <text> | check | stand | set <id> key=value... | add key=value... [--file <path>]
// Default file: $PLAN_FILE, else /mnt/project-files/PLAN.json.
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const STATUSES = ['todo', 'doing', 'wartet', 'done', 'drop']
const today = () => new Date().toISOString().slice(0, 10)

export function problems(plan) {
  const out = []
  if (!plan?.goal) out.push('plan: goal is missing')
  if (!Array.isArray(plan?.items)) return [...out, 'plan: items is not a list']
  const seen = new Set()
  for (const it of plan.items) {
    const id = it.id ?? '?'
    if (!/^M[1-9]\d*$/.test(id)) out.push(`${id}: id is not M<n>`)
    if (seen.has(id)) out.push(`${id}: id used twice`)
    seen.add(id)
    if (!it.title) out.push(`${id}: title is missing`)
    if (!STATUSES.includes(it.status)) out.push(`${id}: status "${it.status}" is not one of ${STATUSES.join(', ')}`)
    if (it.status === 'done' && !it.evidence) out.push(`${id}: done needs evidence (PR, live URL or screenshot link)`)
    if (it.status === 'wartet' && !it.waits_on) out.push(`${id}: wartet needs waits_on (a card, his hands, another item)`)
    if (it.status === 'drop' && !it.why) out.push(`${id}: drop needs why`)
  }
  return out
}

const valid = (plan) => { const p = problems(plan); if (p.length) throw new Error(p.join('\n')); return plan }

export function setItem(plan, id, fields, date = today()) {
  if (!plan.items.some((it) => it.id === id)) throw new Error(`no item ${id}`)
  return valid({ ...plan, updated: date, items: plan.items.map((it) => (it.id === id ? { ...it, ...fields } : it)) })
}

export function addItem(plan, fields, date = today()) {
  const next = Math.max(0, ...plan.items.map((it) => Number(String(it.id).slice(1)) || 0)) + 1
  return valid({ ...plan, updated: date, items: [...plan.items, { id: `M${next}`, status: 'todo', ...fields }] })
}

export function stand(plan) {
  const by = (s) => plan.items.filter((it) => it.status === s)
  const open = plan.items.filter((it) => it.status !== 'drop')
  const line = (it, extra = '') => `${it.id} ${it.title}${it.owner ? ` (${it.owner})` : ''}${extra}`
  const list = (items, fmt) => items.map(fmt).join('; ') || '-'
  return [
    `Ziel: ${plan.goal} (Stand ${plan.updated ?? '?'})`,
    `${by('done').length}/${open.length} done`,
    `Läuft: ${list(by('doing'), (it) => line(it))}`,
    `Wartet: ${list(by('wartet'), (it) => line(it, `: ${it.waits_on}`))}`,
    `Als Nächstes: ${list(by('todo').slice(0, 3), (it) => line(it))}`,
  ].join('\n')
}

const fieldsOf = (args) => Object.fromEntries(args.map((a) => { const i = a.indexOf('='); if (i < 1) throw new Error(`not key=value: ${a}`); return [a.slice(0, i), a.slice(i + 1)] }))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const fi = args.indexOf('--file')
  const file = fi >= 0 ? args.splice(fi, 2)[1] : process.env.PLAN_FILE || '/mnt/project-files/PLAN.json'
  const [cmd, ...rest] = args
  try {
    if (!file) throw new Error('--file needs a path')
    const write = (p) => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, `${JSON.stringify(p, null, 2)}\n`); renameSync(tmp, file); console.log(stand(p)) }
    if (cmd === 'init') {
      if (existsSync(file)) throw new Error(`${file} exists; change it with set, add or goal`)
      write(valid({ goal: fieldsOf(rest).goal, updated: today(), items: [], decisions: [] }))
      process.exit(0)
    }
    if (!existsSync(file)) throw new Error(`${file} is missing; start it with: plan.mjs init goal="<the goal>"`)
    const plan = JSON.parse(readFileSync(file, 'utf8')) // read right before the write: other threads write too
    if (cmd === 'set' && !rest[0]) throw new Error('set needs an item id, e.g. set M3 status=doing')
    if (cmd === 'goal') write(valid({ ...plan, goal: rest.join(' '), updated: today() }))
    else if (cmd === 'check') { valid(plan); console.log(`${file}: ok, ${plan.items.length} items`) }
    else if (cmd === 'stand') console.log(stand(plan))
    else if (cmd === 'set') write(setItem(plan, rest[0], fieldsOf(rest.slice(1))))
    else if (cmd === 'add') write(addItem(plan, fieldsOf(rest)))
    else throw new Error('usage: plan.mjs init goal=<text> | goal <text> | check | stand | set <id> key=value... | add key=value... [--file <path>]')
  } catch (e) { console.error(`plan: ${e.message}`); process.exit(1) }
}
