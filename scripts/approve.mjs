#!/usr/bin/env node
// GameDev 2026-11-15 (#697, #703): an owner-picked sheet was moved in a cleanup and nothing proved the picture was still there.
// One command locks an owner pick into the thing's own folder, one check proves every locked picture is still there:
//   <thing folder>/approval/<picture>   the picked picture itself, a copy (the round folder may go)
//   <thing folder>/approval/INDEX.md    one row per picture: | File | Decision | Date | Source |
//   <thing folder>/DECISIONS.md         the owner's choices (docs/character-workflow.md, Owner decisions); a line names `approval/<picture>`
// One INDEX per thing folder, no project-wide copy: `list` prints the whole list and stores nothing.
//   lock --dir <thing folder> --image <file> --decision "<owner's words>" --source <original files or options sheet>
//        (--msg <owner message link> | --on "<YYYY-MM-DD HH:MM>, imported from <old index>") [--name <file name>] [--item M<n> --plan <PLAN.json>]
//   supersede --dir <thing folder> --file <name>     the picture moves to approval/_superseded/, its row and DECISIONS.md follow
//   check <thing folder> [--root <root>] | check --all <root>     RED and WARN lines, exit 1 only on RED
//   list --all <root>                                 folder, file, decision, date of every INDEX row
//   brief --dir <thing folder> --file <name> --source <path>     the two brief lines, Target image and Source
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setItem } from './plan.mjs'

const PIC = /\.(png|jpe?g|webp|gif|pdf)$/i
const HEADER = '| File | Decision | Date | Source |'
const OLD = '_superseded'
const usage = (m) => Object.assign(new Error(m), { usage: true }) // exit 2: the call is wrong, nothing was written
const isDir = (p) => existsSync(p) && statSync(p).isDirectory()
const slash = (p) => p.replace(/\\/g, '/')
// One boundary for every `approval/<file>` cite of a DECISIONS.md: another folder's `lib/x/approval/A.png` is not this folder's A.png.
const citeRe = (file) => new RegExp(`(?<![\\w./-])approval/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'g')
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

// The INDEX is the first table whose header has File or Image, Decision, Date and Source, in any order, extra columns allowed.
const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
const rowLine = (cells) => `| ${cells.map((c) => one(c).replace(/(?<!\\)\|/g, '\\|')).join(' | ')} |`
// The first cell is read without backticks or link syntax: `A.png`, [A.png](A.png) and ![](A.png) all name A.png.
const fileOf = (cell) => cell.replace(/(!?)\[([^\]]*)\]\(([^)]*)\)/, (_, bang, text, url) => (bang ? url : text)).replace(/`/g, '').trim().replace(/^(\.\/)?approval\//, '')
export function parseIndex(text) {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|') || !/^\s*\|?[\s:|-]*-[\s:|-]*$/.test(lines[i + 1])) continue
    const head = cellsOf(lines[i]).map((c) => c.toLowerCase())
    const col = { file: head.findIndex((c) => c === 'file' || c === 'image'), decision: head.indexOf('decision'), date: head.indexOf('date'), source: head.indexOf('source') }
    if (Object.values(col).some((n) => n < 0)) continue
    let end = i + 2
    const rows = []
    for (; end < lines.length && lines[end].trim().startsWith('|'); end++) {
      const c = cellsOf(lines[end])
      rows.push({ line: end, cells: c, file: fileOf(c[col.file] ?? ''), decision: c[col.decision] ?? '', date: c[col.date] ?? '', source: c[col.source] ?? '' })
    }
    return { lines, col, width: head.length, rows, end }
  }
  return null
}
const readIndex = (dir) => { const f = join(dir, 'approval', 'INDEX.md'); return existsSync(f) ? parseIndex(readFileSync(f, 'utf8')) : null }

export function approvalProblems(dir, root) {
  const red = [], warn = []
  const ap = join(dir, 'approval')
  const has = isDir(ap)
  const pics = has ? readdirSync(ap, { withFileTypes: true }).filter((e) => e.isFile() && PIC.test(e.name)).map((e) => e.name) : []
  const rows = has ? readIndex(dir)?.rows ?? [] : []
  const live = rows.filter((r) => !r.file.startsWith(`${OLD}/`)) // a superseded row stays as history and needs only its file
  if (pics.length && !existsSync(join(ap, 'INDEX.md'))) red.push(`approval/ holds ${pics.length} picture(s) and no INDEX.md (approve.mjs lock writes it)`)
  else for (const p of pics) if (!live.some((r) => r.file === p)) red.push(`approval/${p} has no INDEX.md row`)
  for (const r of rows) {
    if (!r.file || !existsSync(join(ap, r.file))) red.push(`INDEX.md row names ${r.file || '(no file)'}, which is not in approval/`)
    const lacks = [!/\d{4}-\d{2}-\d{2}/.test(r.date) && 'a date (YYYY-MM-DD)', !r.decision && 'a decision', !r.source && 'a source'].filter(Boolean)
    if (lacks.length) red.push(`INDEX.md row ${r.file || '(no file)'} lacks ${lacks.join(', ')}`)
  }
  const df = join(dir, 'DECISIONS.md')
  if (!existsSync(df)) { if (has) red.push('approval/ has no DECISIONS.md beside it'); return { red, warn, pictures: pics.length, folder: has } }
  const text = readFileSync(df, 'utf8')
  const named = new Set([...text.matchAll(/(?<![\w./-])approval\/([\w.\-/]*\.(?:png|jpe?g|webp|gif|pdf))(?!\w)/gi)].map((m) => m[1]))
  for (const n of named) if (!existsSync(join(ap, n))) red.push(`DECISIONS.md names approval/${n}, which is not there`)
  for (const r of live) if (r.file && !citeRe(r.file).test(text)) red.push(`approval/${r.file} is named by no DECISIONS.md line`)
  // WARN, not RED, in v1: the files of 2026-11-15 cite a dead sheet path and three dead gate folders and would all be red.
  for (const [, p] of text.matchAll(/`([^`\n]+)`/g)) {
    if (!p.includes('/') || p.includes('://') || /^approval\/[\w.\-/]*\.(?:png|jpe?g|webp|gif|pdf)$/i.test(p)) continue
    if (![dir, root].some((base) => base && existsSync(resolve(base, p)))) warn.push(`DECISIONS.md names \`${p}\`, which resolves neither from the thing folder nor from the root`)
  }
  return { red, warn: [...new Set(warn)], pictures: pics.length, folder: has }
}

// Thing folders under lib/ and projects/ of the root, to any depth: a folder with an approval/ folder or a DECISIONS.md.
export function thingFolders(root) {
  const out = []
  const walk = (dir) => {
    const names = readdirSync(dir, { withFileTypes: true })
    if (names.some((e) => (e.isDirectory() && e.name === 'approval') || (e.isFile() && e.name === 'DECISIONS.md'))) out.push(dir)
    for (const e of names) if (e.isDirectory() && e.name !== 'approval' && !/^[_.]/.test(e.name)) walk(join(dir, e.name))
  }
  for (const top of ['lib', 'projects']) if (isDir(join(root, top))) walk(join(root, top))
  return out.sort()
}

// check: every line RED or WARN, then the OK line the Archivist quotes. Zero approval folders is RED, never a clean OK.
export function check(dirs, root) {
  const lines = []
  let folders = 0, pictures = 0, warns = 0, reds = 0
  for (const dir of dirs) {
    const where = dirs.length > 1 || root ? `${slash(relative(root ?? '.', dir)) || '.'}: ` : ''
    const r = approvalProblems(dir, root)
    if (r.folder) folders++
    pictures += r.pictures; warns += r.warn.length; reds += r.red.length
    for (const w of r.warn) lines.push(`WARN ${where}${w}`)
    for (const x of r.red) lines.push(`RED ${where}${x}`)
  }
  if (!folders) { reds++; lines.push('RED no approval/ folder found: nothing is locked, so nothing is proven') }
  lines.push(reds ? `RESULT RED approval: ${reds} problem(s), ${warns} warning(s)` : `OK approval: ${folders} folder(s), ${pictures} picture(s), ${warns} warning(s)`)
  return { lines, code: reds ? 1 : 0 }
}

export const listAll = (root) => thingFolders(root).flatMap((dir) => (readIndex(dir)?.rows ?? []).map((r) => `${slash(relative(root, dir))} | ${r.file} | ${r.decision} | ${r.date}`))

const ON = /^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}, imported from \S/
const LINK = /(https?:\/\/|#?cmsg_[A-Za-z0-9]{6,})/i // same proof as the Look-Lock line of a cast sheet (pipeline-gates.mjs)
export function lock({ dir, image, decision, source, msg, on, name, item, plan: planFile, today = new Date().toISOString().slice(0, 10) }) {
  if (!dir || !image || !one(decision) || !one(source)) throw usage('lock needs --dir, --image, --decision and --source')
  if (!msg && !on) throw usage('lock needs --msg <owner message link>, or --on "<YYYY-MM-DD HH:MM>, imported from <old index>" for a pick made before this script')
  if (msg && !LINK.test(msg)) throw usage(`--msg "${msg}" is no message link (https://... or #cmsg_...)`)
  if (!msg && !ON.test(on)) throw usage(`--on "${on}" is not "<YYYY-MM-DD HH:MM>, imported from <old index>"`)
  if (item && !planFile) throw usage('--item needs --plan <PLAN.json>')
  const file = name || basename(image)
  if (!/^[\w.-]+$/.test(file) || !PIC.test(file)) throw usage(`"${file}" is no picture name (letters, digits, . _ - and .png .jpg .jpeg .webp .gif .pdf): DECISIONS.md cites it as approval/<name>`)
  if (!existsSync(image) || !statSync(image).isFile()) throw new Error(`${image} is not a file`)
  if (!isDir(dir)) throw new Error(`${dir} is not a folder`)
  const ap = join(dir, 'approval'), dest = join(ap, file), indexFile = join(ap, 'INDEX.md')
  if (existsSync(dest)) throw new Error(`${dest} exists; a new pick gets a new name, the old one goes with: approve.mjs supersede --dir ${dir} --file ${file}`)
  if ((readIndex(dir)?.rows ?? []).some((r) => r.file === file)) throw new Error(`INDEX.md already has a row for ${file} although its picture is gone; a new pick gets a new name, or: approve.mjs supersede --dir ${dir} --file ${file}`)
  // the plan is read and checked before the first write, so a bad item id leaves no half lock
  const nextPlan = item ? setItem(JSON.parse(readFileSync(planFile, 'utf8')), item, { target_image: slash(relative(dirname(resolve(planFile)), resolve(dest))) }) : null
  const date = msg ? today : on.match(ON)[1]
  const proof = msg || on
  const value = { file, decision, date, source: `${one(source)}; ${proof}` }
  const text = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : ''
  const t = parseIndex(text)
  let next
  if (t) {
    const cells = Array.from({ length: t.width }, () => '')
    for (const k of Object.keys(value)) cells[t.col[k]] = value[k]
    t.lines.splice(t.end, 0, rowLine(cells))
    next = t.lines.join('\n')
  } else next = `${text && `${text.replace(/\n*$/, '')}\n\n`}${HEADER}\n|---|---|---|---|\n${rowLine([value.file, value.decision, value.date, value.source])}\n`
  mkdirSync(ap, { recursive: true })
  copyFileSync(image, dest)
  writeFileSync(indexFile, next)
  // DECISIONS.md is the owner's list of choices; the pick gets its line there unless a line already names the picture (an import).
  const df = join(dir, 'DECISIONS.md'), old = existsSync(df) ? readFileSync(df, 'utf8') : ''
  if (!citeRe(file).test(old)) writeFileSync(df, `${old && `${old.replace(/\n*$/, '')}\n`}- ${date} ${one(decision)}: \`approval/${file}\`, ${proof}\n`)
  if (nextPlan) { const tmp = `${planFile}.${process.pid}.tmp`; writeFileSync(tmp, `${JSON.stringify(nextPlan, null, 2)}\n`); renameSync(tmp, planFile) }
  return { dest, row: value, target_image: nextPlan?.items.find((it) => it.id === item).target_image }
}

export function supersede({ dir, file }) {
  if (!dir || !file) throw usage('supersede needs --dir and --file')
  if (!/^[\w.-]+$/.test(file) || !PIC.test(file)) throw usage(`"${file}" is no picture name (letters, digits, . _ - and .png .jpg .jpeg .webp .gif .pdf): supersede moves one picture of approval/`)
  const ap = join(dir, 'approval'), from = join(ap, file), to = join(ap, OLD, file)
  if (!existsSync(from)) throw new Error(`${from} is not there`)
  if (existsSync(to)) throw new Error(`${to} exists already`)
  mkdirSync(join(ap, OLD), { recursive: true })
  renameSync(from, to)
  const t = readIndex(dir)
  for (const r of t?.rows ?? []) if (r.file === file) { r.cells[t.col.file] = `${OLD}/${file}`; t.lines[r.line] = rowLine(r.cells) }
  if (t) writeFileSync(join(ap, 'INDEX.md'), t.lines.join('\n'))
  const df = join(dir, 'DECISIONS.md')
  if (existsSync(df)) writeFileSync(df, readFileSync(df, 'utf8').replace(citeRe(file), `approval/${OLD}/${file}`))
  return to
}

export function briefLines({ dir, file, source }) {
  if (!dir || !file || !one(source)) throw usage('brief needs --dir, --file and --source')
  const p = join(dir, 'approval', file)
  if (!existsSync(p)) throw new Error(`${p} is not there; lock the pick first`)
  return [`Target image: ${slash(p)}`, `Source: ${one(source)}`]
}

const USAGE = 'usage: approve.mjs lock --dir <thing folder> --image <file> --decision <words> --source <path or link> (--msg <link> | --on "<YYYY-MM-DD HH:MM>, imported from <old index>") [--name <file>] [--item M<n> --plan <PLAN.json>] | supersede --dir <thing folder> --file <name> | check <thing folder> [--root <root>] | check --all <root> | list --all <root> | brief --dir <thing folder> --file <name> --source <path>'
export function main([cmd, ...args], log = console.log, err = console.error) {
  const o = {}, rest = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') o.all = true
    else if (args[i].startsWith('--')) o[args[i].slice(2)] = args[++i]
    else rest.push(args[i])
  }
  try {
    if (cmd === 'lock') { const r = lock(o); log(`locked ${slash(r.dest)}${r.target_image ? `, ${o.item} target_image=${r.target_image}` : ''}`) }
    else if (cmd === 'supersede') log(`superseded ${slash(supersede(o))}`)
    else if (cmd === 'brief') for (const l of briefLines(o)) log(l)
    else if (cmd === 'list' && o.all && rest[0]) for (const l of listAll(rest[0])) log(l)
    else if (cmd === 'check' && rest[0]) {
      const r = o.all ? check(thingFolders(rest[0]), rest[0]) : check([rest[0]], o.root)
      for (const l of r.lines) log(l)
      return r.code
    } else throw usage(USAGE)
    return 0
  } catch (e) { err(`approve: ${e.message}`); return e.usage ? 2 : 1 }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
