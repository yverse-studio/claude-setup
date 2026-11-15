---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Write the plan for this issue. Check every "proven" line against the file before you rely on it.

Issue: add retries to `fetch-all.mjs`.
Proven:
1. `fetchAll` already catches errors per url.
2. `fetchAll` returns results in input order.
3. The file has no retry code today.

```js
// fetch-all.mjs
1  export async function fetchAll(urls) {
2    const results = []
3    await Promise.all(urls.map(async (u) => {
4      const r = await fetch(u)
5      results.push(await r.json())
6    }))
7    return results
8  }
```
