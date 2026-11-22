---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Fix this bug as the Programmer. Show your steps and the file changes as diffs.

Bug: `slug('Hello World ')` returns `'Hello-World-'`, expected `'hello-world'`.

```js
// slug.mjs
export function slug(text) {
  return text.split(' ').join('-')
}
```
```js
// slug.test.mjs
import assert from 'node:assert'
import { slug } from './slug.mjs'
assert.equal(slug('a b'), 'a-b')
```
