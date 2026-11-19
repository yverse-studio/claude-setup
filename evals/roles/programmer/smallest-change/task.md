---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Rename the option `verbose` to `debug` in `cli.mjs`. Only that file and its test. Show the result as a unified diff.

```js
// cli.mjs
export function run(opts = {}) {
  if (opts.verbose) console.log('starting')
  return 0
}
```
```js
// cli.test.mjs
import { run } from './cli.mjs'
run({ verbose: true })
```
