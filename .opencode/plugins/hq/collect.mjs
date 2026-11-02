// The reading side of the Luna HQ panel: the budget file, the cost OpenCode recorded, ~/.claude/open-items.md.
// Used by the plugin (index.js) and by /kosten (node .opencode/plugins/hq/collect.mjs). Reads no API key, none is stored.
import { exec, execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { STALE_MIN, lines, parseBudget, parseOpenItems, ranges, snapshot, view } from './status.mjs'

export const budgetFile = () => join(homedir(), '.config', 'opencode', 'luna-budget.json')
export const openItemsFile = () => join(homedir(), '.claude', 'open-items.md')
const openItemsScript = fileURLToPath(new URL('../../../scripts/open-items.mjs', import.meta.url))

const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return null } }

// Cost in USD that OpenCode recorded from `from` (ms) until now, through the same server API as `opencode stats`.
// Inside the OpenCode server process.execPath is the opencode binary itself; from node the opencode shim needs a shell.
export function costSince(from) {
  const own = /^opencode/i.test(basename(process.execPath))
  // The query goes in the path: --param from= is ignored by opencode api (checked on 2.2.0), the server then answers for all time.
  const args = ['api', 'get', `/api/experimental/session/stats?from=${Number(from)}`]
  const options = { timeout: 30000, windowsHide: true, maxBuffer: 16e6 }
  const done = (resolve) => (err, out) => {
    try { const c = JSON.parse(out).data.cost; resolve(typeof c === 'number' ? c : null) } catch { resolve(null) }
  }
  return new Promise((resolve) => {
    if (own) execFile(process.execPath, args, options, done(resolve))
    else exec(`opencode ${args.join(' ')}`, options, done(resolve))
  })
}

let lastRefresh = 0
// open-items.md is rewritten by scripts/open-items.mjs (gh calls, slow), so an old file starts that script in the background.
function refreshOpenItems(file, now) {
  if (now - lastRefresh < 10 * 60000 || !existsSync(openItemsScript)) return
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0
  if (now - mtime < STALE_MIN * 60000) return
  lastRefresh = now
  const node = /^node/i.test(basename(process.execPath)) ? process.execPath : 'node'
  try { spawn(node, [openItemsScript, '--md'], { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref() } catch { /* no node on PATH: the file stays as it is */ }
}

export async function collect({ now = new Date(), cost = costSince, refresh = true } = {}) {
  const budget = parseBudget(read(budgetFile()))
  const r = ranges(now)
  const [today, week, since] = await Promise.all([cost(r.today), cost(r.week), budget ? cost(budget.sinceMs) : null])
  const md = read(openItemsFile())
  if (refresh) refreshOpenItems(openItemsFile(), now.getTime())
  return snapshot({ budget, spent: { today, week, since }, open: parseOpenItems(md, now), now })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await collect()
  console.log(process.argv.includes('--json') ? JSON.stringify(view(s)) : lines(s).join('\n'))
}
