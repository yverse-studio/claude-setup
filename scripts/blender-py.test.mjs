// The unittest files of scripts/blender (CI runs them with `python -m unittest discover`) also run in `node --test`, so pre-pr.mjs sees them before a push (#391).
// Run: node --test scripts/blender-py.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = join(fileURLToPath(import.meta.url), '..', 'blender')
const py = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0)

test('python unittest of scripts/blender passes (clearance_args, look_switches, progress_heartbeat)', { skip: !py && 'no python on this machine (CI has it)' }, () => {
  const r = spawnSync(py, ['-m', 'unittest', 'discover', '-s', dir, '-p', 'test_*.py'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /test_clearance_args|Ran \d+ tests/)
})
