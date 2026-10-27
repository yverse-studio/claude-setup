// Every job that reads a secret runs in the `production` GitHub Environment, whose deployment
// branch policy allows only main, so a branch copy of a workflow never gets the keys (#311).
// Run: node --test scripts/workflow-secrets.test.mjs
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = join(fileURLToPath(import.meta.url), '..', '..', '.github', 'workflows')
// Any mention of the secrets context (any case, dot, bracket or `secrets: inherit`) counts.
const SECRET = /(?<![\w.-])secrets\b(?!\.GITHUB_TOKEN\b)(?=\s*[.\[:])|toJSON\(\s*secrets/i
// Whole-line comments are prose, not code.
const code = (yaml) => yaml.replace(/^\s*#.*$/gm, '')
const isWorkflow = (n) => /\.ya?ml$/.test(n)
const HEADER = /^  [\w-]+:\s*(?:#.*)?$/m

// Jobs sit two spaces in under `jobs:`; a job's block runs to the next job or the end.
export function jobs(yaml) {
  const body = yaml.split(/^jobs:\s*$/m)[1] ?? ''
  return body.split(/^(?=  [\w-]+:\s*(?:#.*)?$)/m).filter((p) => HEADER.test(p))
    .map((text) => ({ name: text.match(/^  ([\w-]+):/)[1], text }))
}

// What is wrong with one workflow file, as readable lines.
export function violations(yaml, file = 'x.yml') {
  const src = code(yaml)
  const out = []
  if (SECRET.test(src.split(/^jobs:\s*$/m)[0])) out.push(`${file}: secret read outside a job`)
  for (const job of jobs(src)) {
    if (SECRET.test(job.text) && !/^    environment: production\s*$/m.test(job.text)) {
      out.push(`${file} job ${job.name} reads a secret without environment: production`)
    }
  }
  return out
}

test('every real workflow is clean, and the six secret jobs are seen', () => {
  let seen = 0
  for (const f of readdirSync(dir).filter(isWorkflow)) {
    const yaml = readFileSync(join(dir, f), 'utf8')
    assert.deepEqual(violations(yaml, f), [])
    seen += jobs(code(yaml)).filter((j) => SECRET.test(j.text)).length
  }
  assert.ok(seen >= 6, `expected at least 6 secret jobs, found ${seen}`)
})

test('a secret job without the environment is flagged', () => {
  const y = 'on: x\njobs:\n  a:\n    runs-on: u\n    steps:\n      - run: x\n        env:\n          K: ${{ secrets.K }}\n'
  assert.deepEqual(violations(y), ['x.yml job a reads a secret without environment: production'])
})

test('another environment name is flagged, production passes', () => {
  const j = (env) => `jobs:\n  a: # c\n    environment: ${env}\n    steps:\n      - run: echo \${{ secrets.K }}\n`
  assert.equal(violations(j('staging')).length, 1)
  assert.deepEqual(violations(j('production')), [])
})

test('a secret outside jobs is flagged', () => {
  assert.equal(violations('env:\n  K: ${{ secrets.K }}\njobs:\n  a:\n    runs-on: u\n').length, 1)
})

test('secret spellings: these hit', () => {
  for (const s of ['secrets.X', "secrets['X']", 'secrets: inherit', 'toJSON(secrets)', 'SECRETS.X', '${{ secrets.GITHUB_TOKENS }}']) {
    assert.match(s, SECRET, s)
  }
})

test('secret spellings: these pass', () => {
  for (const s of ['secrets.GITHUB_TOKEN', 'workflow-secrets.test.mjs', 'no secrets here', 'my.secrets.x']) {
    assert.doesNotMatch(s, SECRET, s)
  }
})

test('a comment that names secrets is not code', () => {
  assert.deepEqual(violations('# Needs no secrets.x\njobs:\n  a:\n    runs-on: u\n'), [])
})

test('the job splitter finds each job', () => {
  const y = 'on: x\njobs:\n  a:\n    runs-on: u\n  b-c: # note\n    environment: production\n'
  assert.deepEqual(jobs(y).map((j) => j.name), ['a', 'b-c'])
})
