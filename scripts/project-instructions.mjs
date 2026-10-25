#!/usr/bin/env node
// Prints the boot text for a claude.ai project: the template below its `---` line, filled from
// projects/<name>.json and flags. Usage: node scripts/project-instructions.mjs <name>
//   [--about "<one line>"] [--kind site|game|repo|video|social|story] [--repo <org/repo>]
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(root, '.claude/skills/operator/templates/project-instructions.md')
const DEFAULT_ORG = 'yverse-studio'
const SETUP = 'claude-setup'
const SETUP_ABOUT = 'the toolkit every other project loads'
const PRODUCT_LINE = /^Its repo's CLAUDE\.md.*$/m
const SETUP_LINE = 'The repo is claude-setup itself, so there is no product lessons file (docs/LESSONS.md).'
const USAGE = 'usage: node scripts/project-instructions.mjs <name> [--about "<one line>"] [--kind site|game|repo|video|social|story] [--repo <org/repo>]'

const NAME = /^[a-z0-9][a-z0-9-]*$/ // the same shape new-project accepts: repo and Worker name

export const projectFile = (name) => {
  const f = join(root, 'projects', `${name}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}

export function parseArgs(argv) {
  const flags = {}
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i]
    else rest.push(argv[i])
  }
  return { name: rest[0], flags }
}

export function fill(name, flags = {}) {
  if (!NAME.test(name)) throw new Error(`name must be lowercase letters, digits and dashes: ${name}`)
  const setup = name === SETUP
  const file = (setup ? null : projectFile(name)) ?? {}
  const values = {
    name,
    about: flags.about ?? (setup ? SETUP_ABOUT : name),
    kind: flags.kind ?? (setup ? 'setup' : file.kind ?? 'site'),
    repo: flags.repo ?? `${setup ? DEFAULT_ORG : file.org ?? DEFAULT_ORG}/${name}`,
  }
  let text = readFileSync(TEMPLATE, 'utf8').split(/^---\r?\n/m)[1].trim()
  if (setup) text = text.replace(PRODUCT_LINE, SETUP_LINE)
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => values[k] ?? m)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { name, flags } = parseArgs(process.argv.slice(2))
  if (!name || !NAME.test(name) || Object.values(flags).some((v) => v === undefined)) {
    console.error(USAGE)
    process.exit(1)
  }
  if (name !== SETUP && !projectFile(name)) console.error(`note: no projects/${name}.json; using the name and flags only`)
  console.log(fill(name, flags))
}
