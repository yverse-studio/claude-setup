#!/usr/bin/env node
// Fails when a file under assets/ has no manifest row, a row has no file, or a licence forbids a
// paid game. Usage: node check-assets.mjs assets/manifest.json   (exit 1 on errors)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FORBIDDEN = [/\bnc\b/i, /non-?commercial/i, /personal(?:\s|-)?(?:use|non-?profit)/i, /no commercial/i]

export function checkAssets(manifest, files) {
  const errors = []
  const rows = new Map()
  for (const a of manifest.assets ?? []) {
    for (const k of ['name', 'path', 'source', 'author', 'licence']) if (!a[k]) errors.push(`${a.name ?? a.path}: missing ${k}`)
    if (a.commercial !== true) errors.push(`${a.name}: commercial is not true`)
    if (FORBIDDEN.some((re) => re.test(a.licence ?? ''))) errors.push(`${a.name}: licence "${a.licence}" forbids a paid game`)
    if (a.path) rows.set(a.path.replace(/^(?:\.?\/)+/, '').replace(/\/$/, ''), a)
  }
  const covered = (f) => [...rows.keys()].some((p) => f === p || f.startsWith(p + '/'))
  for (const f of files) if (!covered(f)) errors.push(`${f}: no manifest row`)
  for (const p of rows.keys()) if (!files.some((f) => f === p || f.startsWith(p + '/'))) errors.push(`${p}: row has no file`)
  return errors
}

function walk(dir, root = dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p, root) : [relative(dirname(root), p).split('\\').join('/')]
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? 'assets/manifest.json'
  const assetsDir = dirname(resolve(file))
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  const files = existsSync(assetsDir) ? walk(assetsDir).filter((f) => !f.endsWith('manifest.json')) : []
  const errors = checkAssets(manifest, files)
  for (const e of errors) console.error('assets: ' + e)
  console.log(errors.length ? `assets: ${errors.length} problem(s)` : `assets: ${files.length} files, all licensed`)
  process.exit(errors.length ? 1 : 0)
}
