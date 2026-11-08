import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conflictMarker } from './conflict-marker.mjs'

test('conflict markers: the three git markers are found, prose that looks like them is not', () => {
  assert.equal(conflictMarker('a\n>>>>>>> setup/lessons-inbox\nb'), 2)
  assert.equal(conflictMarker('<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> main\n'), 1)
  assert.equal(conflictMarker('title\n=======\n'), 2, 'a bare ======= line is a marker (setext headings use === at any other length)')
  assert.equal(conflictMarker('a\n========\n<<<<<<<<<< not seven\n>>>>>>>>\n'), 0)
  assert.equal(conflictMarker(''), 0)
})
