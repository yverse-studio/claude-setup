---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this plan as the gate reviewer before any code is written. Do not change files.

Plan (step 3 of 4): "In `report.mjs`, call `parseTags(line)` and loop over the returned list with `for (const t of tags)` to print each tag."

The function the plan reuses, as it is in the repo:

```js
// tags.mjs
1  export function parseTags(line) {
2    const out = {}
3    for (const part of line.split(',')) {
4      const [k, v] = part.split('=')
5      out[k.trim()] = v?.trim() ?? true
6    }
7    return out
8  }
```
