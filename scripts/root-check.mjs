#!/usr/bin/env node
// #601: a project-files root holds entry files only (the cloud counterpart of tidy_check.py for the laptop studio root).
// Usage: node scripts/root-check.mjs <root>   prints OK or one RED line per stray file and exits 1 on any RED.
// The entry files are the line `Entry files: a.md, b.md` of the root's MAP.md (MAP.md itself always counts); without that line the default list applies.
// One directory read, no walk: the mount is slow, and a folder is where files belong. Dot files are tool state and are not read as strays.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_ENTRY = ['MAP.md', 'FIND.md', 'PROVEN.md', 'PIPELINE.md', 'README.md']

export function entryList(root) {
  let line = ''
  try { line = readFileSync(join(root, 'MAP.md'), 'utf8').split('\n').find((l) => /^[ \t>*-]*Entry files:/i.test(l)) ?? '' } catch { /* no MAP.md: the default list */ }
  const names = line.replace(/^[^:]*:/, '').split(',').map((n) => n.replace(/[`*]/g, '').trim()).filter(Boolean)
  return names.length ? { from: 'the Entry files line of MAP.md', names: ['MAP.md', ...names] } : { from: 'the default list, no Entry files line in MAP.md', names: DEFAULT_ENTRY }
}
export const entryFiles = (root) => new Set(entryList(root).names)

export function strayFiles(root, entries = entryFiles(root)) {
  return readdirSync(root, { withFileTypes: true }).filter((d) => !d.isDirectory() && !d.name.startsWith('.') && !entries.has(d.name)).map((d) => d.name)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (!root) { console.error('usage: node scripts/root-check.mjs <project-files root>'); process.exit(2) }
  try {
    const list = entryList(root), stray = strayFiles(root)
    if (!stray.length) console.log(`OK ${resolve(root)}: entry files only, allowed by ${list.from}: ${[...new Set(list.names)].join(', ')}`)
    else { for (const f of stray) console.log(`RED ${resolve(root)}: ${f} is not an entry file (move it into its folder, or name it on the Entry files line of MAP.md)`); process.exit(1) }
  } catch (e) { console.error(`root-check: ${e.message}`); process.exit(2) }
}
