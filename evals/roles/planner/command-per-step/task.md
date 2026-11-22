---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Write the plan for this fix as a table of steps. The test file is `add.test.mjs`, run with `node --test add.test.mjs`.

Issue: `add(a, b)` in `add.mjs` returns a string when one argument is a numeric string ("2" + 3 = "23"). Make it return a number, throw a TypeError for a non-numeric string, and update the README line that says "add joins strings".
