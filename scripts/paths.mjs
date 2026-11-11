// The one resolver for laptop paths in JavaScript (hooks, guards, tests). The root is the env var STUDIO_ROOT,
// the folder names live in config/paths.json. Nothing else in this repo may write a drive path
// (scripts/paths-lint.test.mjs). Not set = stop: there is no default root to fall back to.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const table = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'paths.json'), 'utf8'))

export const deadNames = table.dead_names

export function studioRoot(env = process.env) {
  const root = env.STUDIO_ROOT
  if (!root) throw new Error('set STUDIO_ROOT (the root folder of the studio, see docs/laptop-folders.md)')
  return root
}

// studioPath('companyxy', 'ch01', 'x.md') -> <STUDIO_ROOT>/projects/games/companyxy/ch01/x.md
export function studioPath(name, ...rest) {
  const rel = table.names[name]
  if (!rel) throw new Error(`unknown path name "${name}" (config/paths.json)`)
  return join(studioRoot(), ...rel.split('/'), ...rest)
}
