#!/usr/bin/env node
// M50 slice C: the count of thread starts of one project (docs/WORKFLOW.md, Thread starts).
// Usage: node scripts/brief-stats.mjs [project-folder] [--days N]   (default: the project's /mnt/project-files/claude-setup)
import { projectFolder, statsLine } from '../global/card-render.mjs'
import { fileURLToPath } from 'node:url'

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const i = args.indexOf('--days')
  const days = i >= 0 ? Number(args.splice(i, 2)[1]) : 0
  console.log(statsLine(args[0] ?? projectFolder(), days > 0 ? new Date(Date.now() - days * 864e5) : null))
}
