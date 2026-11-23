#!/usr/bin/env node
// #754: a topic memory file holds state only. Lists every *.md file in a memory directory (except MEMORY.md) over 1,536 bytes.
// Usage: node scripts/memory-size.mjs <memory dir>   (exit 1 when any file is listed, 0 otherwise)
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MEMORY_LIMIT = 1536

export function memorySize(dir, limit = MEMORY_LIMIT) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'MEMORY.md')
    .map((file) => ({ file, bytes: statSync(join(dir, file)).size }))
    .filter((r) => r.bytes > limit)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2]
  if (!dir) { console.error('usage: node scripts/memory-size.mjs <memory dir>'); process.exit(2) }
  if (!existsSync(dir)) console.log(`memory-size: no memory directory at ${dir}, nothing to check`)
  else {
    const over = memorySize(dir)
    for (const r of over) console.log(`${r.file}: ${r.bytes} bytes (over ${MEMORY_LIMIT}; state only, archive a finished plan)`)
    if (!over.length) console.log('ok: no topic memory file over the size')
    process.exitCode = over.length ? 1 : 0
  }
}
