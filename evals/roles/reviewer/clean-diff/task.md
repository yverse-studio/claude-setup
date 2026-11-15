---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this change as the gate reviewer. Do not change files.

Slice goal: a gate verdict passes only when the mean of the scores is at least 4.5, written with two decimals.

```diff
--- a/gate-mean.mjs
+++ b/gate-mean.mjs
@@ -1,3 +1,8 @@
+// passes when the mean reaches the threshold
+export function passes(scores, threshold = 4.5) {
+  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
+  return Number(mean.toFixed(2)) >= threshold
+}
--- a/gate-mean.test.mjs
+++ b/gate-mean.test.mjs
@@ -1,2 +1,8 @@
+import { passes } from './gate-mean.mjs'
+import assert from 'node:assert'
+assert.equal(passes([5, 5, 5]), true)
+assert.equal(passes([3, 3, 3]), false)
+assert.equal(passes([4.49]), false)
+assert.equal(passes([4.5]), true)
```
