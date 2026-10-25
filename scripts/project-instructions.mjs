#!/usr/bin/env node
// Prints the boot text for a claude.ai project: the template below its `---` line, filled from
// projects/<name>.json and flags. Usage: node scripts/project-instructions.mjs <name>
//   [--about "<one line>"] [--kind site|game|repo|video|social|story] [--repo <org/repo>|none|new]
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
// --repo none: a project with no repo of its own (a social or video team); --repo new: the
// new-project workflow makes the repo at the first idea (docs/USING.md), so until then it has none.
const NONE_LINE = 'This project has no repo of its own: its lessons go to claude-setup (the skill of its kind, e.g. social-team or video-studio learnings.md; docs/MAP.md Kits names it).'
const NEW_LINE = 'Its repo does not exist yet: the new-project workflow makes it at the first idea (claude-setup docs/USING.md, Deploy a page in one shot); from then on its CLAUDE.md and docs/LESSONS.md come next and product lessons go there.'
const USAGE = 'usage: node scripts/project-instructions.mjs <name> [--about "<one line>"] [--kind site|game|repo|video|social|story] [--repo <org/repo>|none|new]'

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
  else if (values.repo === 'none') text = text.replace(PRODUCT_LINE, NONE_LINE).replace('; repo {{repo}})', ')')
  else if (values.repo === 'new') text = text.replace(PRODUCT_LINE, NEW_LINE).replace('; repo {{repo}})', ')')
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
