#!/usr/bin/env node
// Turns on the Luna HQ strip in OpenCode Desktop: OpenCode Desktop loads GUI plugins only from the global config, so this adds
// this clone's .opencode/plugins/hq to "plugins" in ~/.config/opencode/opencode.json (once; re-run after moving the clone).
// Run: node scripts/hq-panel-install.mjs [--remove]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Any clone's hq folder counts as ours, so moving the clone replaces the old entry instead of loading the plugin twice.
const ours = (p) => typeof p === 'string' && /[\\/]\.opencode[\\/]plugins[\\/]hq[\\/]?$/i.test(p)

// Pure: the config with `dir` in plugins (add) or without it (remove). Other entries and keys stay as they are.
export function withPlugin(config, dir, remove = false) {
  const plugins = Array.isArray(config.plugins) ? config.plugins : []
  const rest = plugins.filter((p) => !ours(p) && p !== dir)
  const next = remove ? rest : [...rest, dir]
  const out = { ...config }
  if (next.length) out.plugins = next
  else delete out.plugins
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = resolve(fileURLToPath(new URL('../.opencode/plugins/hq', import.meta.url)))
  const file = join(homedir(), '.config', 'opencode', 'opencode.json')
  const remove = process.argv.includes('--remove')
  let config = {}
  if (existsSync(file)) {
    try { config = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch {
      console.error(`${file} is not plain JSON (comments?). Add "${dir.replaceAll('\\', '\\\\')}" to its "plugins" list by hand.`)
      process.exit(1)
    }
  }
  writeFileSync(file, `${JSON.stringify(withPlugin(config, dir, remove), null, 2)}\n`)
  console.log(`${remove ? 'removed' : 'added'}: ${dir} in ${file}`)
}
