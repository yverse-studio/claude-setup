#!/usr/bin/env node
// Minimal local render queue: runs queued Blender jobs one after another, independent of any Claude session.
// Add a job: write <queueDir>/jobs/<NN>-<name>.json  {"name":"titten","cmd":["blender.exe","-b",...],"progress":"<file the job rewrites per frame>","final":"<final video; thumb.jpg beside it is rebuilt when the job succeeds>"} (a Blender job needs "progress" or "noProgress":"<why>")  (sorted by file name).
// Start once, detached:  node scripts/render-queue.mjs <queueDir>
// Each job runs through laptop-job.mjs (watchdog, RAM and slot checks). Log: <queueDir>/queue.log; states: .json -> .running -> .done|.fail
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { refreshPreview } from './pipeline-gates.mjs'

const POLL_MS = 30_000
const LAPTOP_JOB = join(dirname(fileURLToPath(import.meta.url)), 'laptop-job.mjs')
const dir = process.argv[2] ?? '.'
const jobs = join(dir, 'jobs'), logs = join(dir, 'logs')
const log = (m) => appendFileSync(join(dir, 'queue.log'), `${new Date().toISOString()} ${m}\n`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Stop switch: while <queueDir>/STOP exists no new job is taken; a job killed by "now" goes back to .json.
const stopped = () => existsSync(join(dir, 'STOP'))
export const endState = (lastLine, status) => (/^JOB STOPPED /.test(lastLine) ? '.json' : status === 0 ? '.done' : '.fail')

// A .running left by a queue that died never finishes; mark it .fail on start so it is visible and never blocks.
export const staleRunning = (files) => files.filter((f) => f.endsWith('.running'))

export function nextJob(files) { return files.filter((f) => f.endsWith('.json')).sort()[0] }

async function main() {
  if (!process.argv[2]) { console.error('usage: render-queue.mjs <queueDir>'); process.exit(2) }
  mkdirSync(jobs, { recursive: true }); mkdirSync(logs, { recursive: true })
  log('queue started')
  for (const f of staleRunning(readdirSync(jobs))) { renameSync(join(jobs, f), join(jobs, f.replace(/\.running$/, '.fail'))); log(`STALE ${f}: left by an earlier queue run, marked .fail`) }
  for (;;) {
    const f = stopped() ? null : nextJob(readdirSync(jobs))
    if (!f) { await sleep(POLL_MS); continue }
    const p = join(jobs, f), run = p.replace(/\.json$/, '.running')
    renameSync(p, run)
    const { name, cmd, timeoutMin = 240, progress, noProgress, final } = JSON.parse(readFileSync(run, 'utf8'))
    log(`START ${name}`)
    const r = spawnSync(process.execPath, [LAPTOP_JOB, '--name', name, '--timeout-min', String(timeoutMin), ...(progress ? ['--progress-file', progress] : []), ...(noProgress ? ['--no-progress', noProgress] : []), '--', ...cmd], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LAPTOP_STOP_FILE: join(dir, 'STOP') } })
    writeFileSync(join(logs, `${f.replace(/\.json$/, '')}.log`), `${r.stdout || ''}\n--- stderr ---\n${r.stderr || ''}`)
    const last = (r.stdout || '').trim().split('\n').pop() || `exit ${r.status}`
    log(`END ${name}: ${last}`)
    const state = endState(last, r.status)
    if (state === '.done' && final) { const p = refreshPreview(final); log(p.ok ? `PREVIEW ${name}: ${p.thumb} refreshed` : `PREVIEW ${name}: ${p.why}`) }   // companyxy 2026-11-12: thumb.jpg came from old webms
    renameSync(run, run.replace(/\.running$/, state))
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main()
