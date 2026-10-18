// Writes src/commit.js from the commit Workers Builds is building, so /api/config can prove
// which commit is live (the live check in claude-setup's publish skill).
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// Only Workers Builds (WORKERS_CI) and CI write it: a local build must not leave a tracked file dirty.
if (!process.env.WORKERS_CI && !process.env.CI) {
  console.log('local build: src/commit.js left as committed')
  process.exit(0)
}

// A build started from the trigger API (new-project's first build) gets the branch name here.
let commit = /^[0-9a-f]{40}$/.test(process.env.WORKERS_CI_COMMIT_SHA || '') ? process.env.WORKERS_CI_COMMIT_SHA : ''
if (!commit) {
  try { commit = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { commit = 'dev' }
}
writeFileSync(new URL('../src/commit.js', import.meta.url), `export const COMMIT = '${commit}'\n`)
console.log(`commit ${commit}`)
