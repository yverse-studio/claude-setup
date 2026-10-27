// Every job that reads a secret runs in the `production` GitHub Environment, whose deployment
// branch policy allows only main, so a branch copy of a workflow never gets the keys (#311).
// Run: node --test scripts/workflow-secrets.test.mjs
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = join(fileURLToPath(import.meta.url), '..', '..', '.github', 'workflows')
// Any mention of the secrets context (any case, dot or bracket, `secrets: inherit`) counts.
const SECRET = /(?<![\w.-])secrets\b(?!\.GITHUB_TOKEN\b)(?=\s*[.\[:])|toJSON\(\s*secrets/i
// Comments are prose, not code.
const code = (yaml) => yaml.replace(/^\s*#.*$/gm, '').replace(/\s#.*$/gm, '')
const isWorkflow = (n) => /\.ya?ml$/.test(n)

// Jobs sit two spaces in under `jobs:`; a job's block runs to the next job or the end.
export function jobs(yaml) {
  const body = yaml.split(/^jobs:\s*$/m)[1] ?? ''
  const parts = body.split(/^(?=  [\w-]+:\s*(?:#.*)?$)/m).filter((p) => /^  [\w-]+:\s*(?:#.*)?$/m.test(p))
  return parts.map((text) => ({ name: text.match(/^  ([\w-]+):/)[1], text }))
}

test('a workflow reads secrets only inside jobs', () => {
  for (const f of readdirSync(dir).filter(isWorkflow)) {
    const yaml = code(readFileSync(join(dir, f), 'utf8'))
    const outside = yaml.split(/^jobs:\s*$/m)[0]
    assert.doesNotMatch(outside, SECRET, `${f}: secret read outside a job`)
  }
})

test('every job with a secret declares environment: production', () => {
  let seen = 0
  for (const f of readdirSync(dir).filter(isWorkflow)) {
    for (const job of jobs(code(readFileSync(join(dir, f), 'utf8')))) {
      if (!SECRET.test(job.text)) continue
      seen++
      assert.match(job.text, /^    environment: production\s*$/m, `${f} job ${job.name} reads a secret without environment: production`)
    }
  }
  assert.ok(seen >= 6, `expected at least 6 secret jobs, found ${seen}`)
})

test('the job splitter finds each job', () => {
  const y = 'on: x\njobs:\n  a:\n    runs-on: u\n  b-c:\n    environment: production\n'
  assert.deepEqual(jobs(y).map((j) => j.name), ['a', 'b-c'])
})
