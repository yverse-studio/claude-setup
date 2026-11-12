#!/usr/bin/env node
// The thread brief generator (docs/templates/thread-brief.md): builds the brief block from a role, a kit and a size, reading the
// Roster and Kits from docs/TEAMS.md, so what it prints always passes team-guard. It refuses what the guard would refuse (an unknown
// role or kit, a role the kit does not allow) and names every field you did not give; it guesses none (CLAUDE.md, No fog).
// Usage: node scripts/brief.mjs --role <Role> --kit <kit> --size <S|M|L> --item <M<n>|new> --threads <text> --prior-art <text>
//          --done <text> --stop <text> [--what <title words>] [--start <files>] [--skills <text>] [--sheet <path|n/a why>]
//          [--look-lock <card link>] [--topic <checklist topic, Reviewer only>] [--tester <thread>] [--researcher <text>] [--gate <reviewer thread>] [--json]
//        node scripts/brief.mjs --lines   one line per Roster role: its kits, model and playbook (for the coordinator's index)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHECKLISTS, GATE_BUILDER_ROLES, GATE_LINE, badRole, badTeam, badTopic, decide, kitNames, rosterNames } from '../global/team-guard.mjs'
import { GATE_ROLES, roleOf } from '../global/rule-guard.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TIERS = ['fable', 'opus', 'sonnet', 'haiku']
export class BriefError extends Error {}

const modelIds = (teams) => Object.fromEntries([...teams.matchAll(/(Fable|Opus|Sonnet|Haiku) \((claude-[\w.-]+)\)/g)].map((m) => [m[1].toLowerCase(), m[2]]))
// The tier a thread of this role starts on: the first tier its Roster row names (a later "Fable on a hard task" is the coordinator's call).
const modelCell = (row) => row.match(/Model: (.*?)\.?$/)?.[1] ?? ''
const tierOf = (row) => TIERS.find((t) => (modelCell(row).split(';')[0]).toLowerCase().includes(t)) // undefined: the row names none (the Project Manager's is set by yskills)
const runsAs = (row) => row.match(/Runs as: (.*?)\. Model:/)?.[1] ?? ''
const stub = (role, kit, size) => `Role: ${role} · Kit: ${kit} · Size: ${size}`

export function buildBrief({ role, kit, size, item, threads, priorArt, done, stop, what, start, skills, sheet, lookLock, tester, researcher, gate, topic, checklists = readFileSync(join(root, CHECKLISTS), 'utf8'), teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8') }) {
  const roles = rosterNames(teams)
  const kits = kitNames(teams)
  if (!roles.includes(role)) throw new BriefError(`Role: ${role} is no role in docs/TEAMS.md (Roster); valid: ${roles.join(', ')}`)
  if (!kits.includes(kit)) throw new BriefError(`Kit: ${kit} is no kit in docs/TEAMS.md (Kits); valid: ${kits.join(', ')}`)
  if (!['S', 'M', 'L'].includes(size)) throw new BriefError(`Size: ${size} is none of S, M, L`)
  const refused = badRole(stub(role, kit, size), teams) ?? badTeam(stub(role, kit, size), teams)
  if (refused) throw new BriefError(refused)
  const badTopicWhy = topic !== undefined && badTopic(`Role: ${role}\nTopic: ${topic}`, checklists)
  if (badTopicWhy) throw new BriefError(badTopicWhy)
  const info = roleOf(stub(role, kit, size), teams)
  const needsSheet = /^(Programmer|Animator)$/.test(role) && /^(game|story)$/.test(kit)
  const skillsLine = skills ?? (topic ? CHECKLISTS : info.path) // a Topic Reviewer works from its checklist, not the code playbook
  // A gate role's Prior art names the gate rules and the kit's checks (rule-guard briefCheck, GATE_PRIOR): written here, never by hand (CompanyXY 2026-11-12: two Reviewer threads blocked).
  const gateRole = GATE_ROLES.test(role)
  const prior = gateRole ? `.claude/skills/operator/gate.md and the ${kit} kit's checks (docs/TEAMS.md, Kits)${topic ? `; ${CHECKLISTS} (Topic: ${topic})` : ''}${priorArt ? `; ${priorArt}` : ' -> adapt, because the gate rules and checks already exist'}` : priorArt
  const builder = new RegExp(`^${GATE_BUILDER_ROLES}$`).test(role) && size !== 'S'
  const named = gate ?? `Reviewer · ${what}`
  const gateLine = builder ? `Gate: ${/^n\/a/i.test(named) || /\bbefore owner\b/.test(named) ? named : `${named} before owner`}` : null
  if (gateLine && !GATE_LINE.test(gateLine)) throw new BriefError('--gate names a Reviewer or Tester thread and ends "before owner" (given as --gate "Reviewer · <what> before owner"), or reads "n/a <why this slice has no owner-facing result>" with 10+ characters')
  const missing = Object.entries({ item, threads, 'prior-art': prior, done, stop, skills: skillsLine, ...(size === 'S' ? {} : { what }), ...(needsSheet ? { sheet } : {}), ...(role === 'Programmer' && size === 'L' ? { tester } : {}) })
    .filter(([, v]) => !v).map(([k]) => `--${k}`)
  if (needsSheet && sheet && !/^n\/a/i.test(sheet) && !lookLock) missing.push('--look-lock')
  if (needsSheet && /^n\/a/i.test(sheet ?? '') && !/^n\/a[ \t]+\S[^\n]{9,}$/i.test(sheet)) throw new BriefError('--sheet n/a needs a reason of 10+ characters after it (team-guard: Sheet: n/a <why this is no body, face or outfit job>)')
  if (missing.length) throw new BriefError(`missing, never guessed: ${missing.join(', ')}`)
  const tier = tierOf(info.row)
  if (!tier) throw new BriefError(`the Roster row of ${role} names no model tier ("${modelCell(info.row)}"); the model of this role is not the generator's to pick`)
  const model = modelIds(teams)[tier]
  const lines = [stub(role, kit, size), `Model: ${model}`, `Item: ${item}`, `Threads: ${threads}`, `Prior art: ${prior}`, `Skills: ${skillsLine}`,
    ...(needsSheet ? [`Sheet: ${sheet}`, ...(/^n\/a/i.test(sheet) ? [] : [`Look-Lock: ${lookLock}`])] : []),
    ...(topic ? [`Topic: ${topic}`] : []), ...(gateLine ? [gateLine] : []), ...(researcher ? [`Researcher: ${researcher}`] : []), ...(role === 'Programmer' && size === 'L' ? [`Tester: ${tester}`] : []),
    `Done when: ${done}`, `Stop when: ${stop}`, `Start: read MEMORY.md first${start ? `, then ${start}` : ''}`]
  const out = { brief: lines.join('\n'), title: `${role} · ${what ?? item}`, model }
  // Belt and braces: what leaves here passes the guard, or it does not leave.
  const blocked = decide('mcp__hearthbot__start_thread', out, [], [], teams, checklists)
  if (blocked.block) throw new BriefError(`the generated brief fails team-guard: ${blocked.block}`)
  return out
}

// One line per Roster role: the kits it may start on at size M (L for the Planner is no different), its tier and its playbook.
export function roleLines(teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')) {
  return rosterNames(teams).map((role) => {
    const info = roleOf(stub(role, 'setup', 'M'), teams)
    const ok = kitNames(teams).filter((kit) => !badTeam(stub(role, kit, 'M'), teams))
    return `${role}: Kit: ${ok.length ? ok.join(', ') : 'none at size M (see Kits)'}; Model: ${tierOf(info.row) ?? modelCell(info.row)}; Runs as: ${runsAs(info.row).slice(0, 40)}; Skills: ${info.path ?? 'its Roster row'}`
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = (name) => {
    const i = args.indexOf(`--${name}`)
    if (i < 0) return undefined
    if (args[i + 1] === undefined || args[i + 1].startsWith('--')) { console.error(`brief: --${name} needs a value`); process.exit(2) }
    return args[i + 1]
  }
  if (args.includes('--lines')) { console.log(roleLines().join('\n')); process.exit(0) }
  try {
    const out = buildBrief({ role: flag('role'), kit: flag('kit'), size: flag('size'), item: flag('item'), threads: flag('threads'), priorArt: flag('prior-art'),
      done: flag('done'), stop: flag('stop'), what: flag('what'), start: flag('start'), skills: flag('skills'), sheet: flag('sheet'), lookLock: flag('look-lock'),
      tester: flag('tester'), researcher: flag('researcher'), gate: flag('gate'), topic: flag('topic') })
    console.log(args.includes('--json') ? JSON.stringify(out) : out.brief)
  } catch (e) {
    if (!(e instanceof BriefError)) throw e
    console.error(`brief: ${e.message}`)
    process.exit(2)
  }
}
