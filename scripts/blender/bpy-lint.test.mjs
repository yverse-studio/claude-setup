// Run: node --test scripts/blender/bpy-lint.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lint } from './bpy-lint.mjs'

test('flags removed 4.x/5.x calls', () => {
  const src = 'me.use_auto_smooth = True\nscene.render.engine = "BLENDER_EEVEE_NEXT"\nfor fc in act.fcurves: pass\nb.inputs["Specular"].default_value = 0.5\n'
  assert.deepEqual(lint('a.py', src).map((h) => h.line), [1, 2, 3, 4])
})
test('channelbag fcurves, comments and the new names pass', () => {
  const src = '# me.use_auto_smooth = True\nfor fc in channelbag.fcurves: pass\nb.inputs["Specular IOR Level"].default_value = 0.5\nsc.render.engine = "BLENDER_EEVEE"\n'
  assert.deepEqual(lint('a.py', src), [])
})
test('use_nodes is a warning and shadow names are errors', () => {
  assert.equal(lint('a.py', 'm.use_nodes = True')[0].warn, true)
  assert.equal(lint('/x/inspect.py', '')[0].line, 0)
})
