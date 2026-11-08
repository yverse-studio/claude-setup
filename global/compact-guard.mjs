#!/usr/bin/env node
// PreCompact hook: what a hook prints to stdout becomes instructions for the compaction summary.
// Tell it what to keep verbatim (the thread's Role/Kit/Size line, branch, PR, asks, decisions with
// reasons, the last error, files changed, Done-when) and what to drop, and save the same headings as a
// note in /mnt/project-files/<project>/handoff/ when the project is known. Never fails a compaction.
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, statSync, writeSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve, sep } from 'node:path'

const BASE = process.env.CLAUDE_SETUP_PROJECT_FILES || '/mnt/project-files'
const CHUNK = 256 * 1024

const INSTRUCTIONS = `Compaction summary: keep these verbatim, drop the rest.
Keep verbatim: the thread's "Role: ... · Kit: ... · Size: ..." line; the branch and the PR; the open asks of yskills and their status; every decision with its reason; the last error text verbatim; the files changed; the "Done when:" line.
Drop: logs, intermediate states, tool output.`

function tail(path) {
  const fd = openSync(path, 'r')
  try {
    const len = statSync(path).size
    const n = Math.min(CHUNK, len)
    const buf = Buffer.alloc(n)
    readSync(fd, buf, 0, n, len - n)
    return buf.toString('utf8')
  } finally { closeSync(fd) }
}

function extract(text) {
  const tools = []
  let lastPost = ''
  for (const line of text.split('\n')) {
    try {
      const content = JSON.parse(line).message?.content
      for (const b of Array.isArray(content) ? content : []) {
        if (b.type !== 'tool_use') continue
        tools.push(b.name)
        if (/post_message$/.test(b.name) && typeof b.input?.text === 'string') lastPost = b.input.text
      }
    } catch { continue } // the chunk's cut-off first line, or a blank
  }
  return { tools: tools.slice(-30), lastPost }
}

function branchOf(cwd) {
  try {
    if (!cwd || !existsSync(cwd)) return ''
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { return '' }
}

// The project folder named in cwd or in the transcript. Transcript text is untrusted (tool output, web
// pages), so the name is a plain word (no dots, no slashes) and the folder must resolve inside BASE.
function projectOf(cwd, text) {
  const re = new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([A-Za-z0-9][\\w-]*)/`)
  const name = String(cwd).match(re)?.[1] || text.match(re)?.[1] || ''
  if (!name || !/^[A-Za-z0-9][\w-]*$/.test(name)) return ''
  return resolve(BASE, name).startsWith(resolve(BASE) + sep) ? name : ''
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', () => {
  let out = INSTRUCTIONS
  try {
    const { session_id: id = 'unknown', transcript_path: path, trigger = 'auto', cwd = '' } = JSON.parse(raw || '{}')
    let text = ''
    try { if (path && existsSync(path)) text = tail(path) } catch (e) { out += `\n(transcript not read: ${e.message})` }
    const project = projectOf(cwd, text)
    const dir = project ? join(BASE, project) : ''
    if (dir && existsSync(dir)) {
      const { tools, lastPost } = extract(text)
      const short = String(id).replace(/[^\w-]/g, '').slice(0, 8) || 'unknown'
      const file = join(dir, 'handoff', `${new Date().toISOString().slice(0, 10)}-compact-${short}.md`)
      const note = [
        `# Compaction state (${trigger}, session ${short})`,
        '',
        '## Role / Kit / Size',
        '(copy the thread\'s "Role: · Kit: · Size:" line)',
        '',
        '## Branch and PR',
        branchOf(cwd) || '(branch unknown)',
        '',
        '## Open asks of yskills',
        '(none extracted)',
        '',
        '## Decisions with reasons',
        '(none extracted)',
        '',
        '## Last error',
        '(none extracted)',
        '',
        '## Files changed',
        '(see git status in the branch)',
        '',
        '## Done when',
        '(copy the brief\'s Done-when line)',
        '',
        '## Last 30 tool calls',
        tools.join(', ') || '(none)',
        '',
        '## Last post_message',
        lastPost || '(none)',
        '',
      ].join('\n')
      try {
        // The folder is shared with other threads: never follow a planted symlink, never overwrite.
        const handoff = join(dir, 'handoff')
        mkdirSync(handoff, { recursive: true })
        if (lstatSync(handoff).isSymbolicLink() || !realpathSync(handoff).startsWith(realpathSync(BASE) + sep)) throw new Error('handoff dir is a link or outside the base')
        const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644)
        try { writeSync(fd, note) } finally { closeSync(fd) }
        out += `\nState saved at ${file}.`
      } catch (e) { out += `\nState not saved (${e.message}); keep the headings above in the summary.` }
    }
  } catch {
    // A guard must never break a compaction.
  }
  process.stdout.write(`${out}\n`)
})
