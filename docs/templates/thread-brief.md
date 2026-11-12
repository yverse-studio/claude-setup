# Thread brief template

The one fixed shape of a thread brief (companyxy 2026-11-12: almost every start failed the brief check one line at a
time, an extra round each). Copy the block, fill every `<...>`, one field per line, then start the thread. `team-guard`
(`global/team-guard.mjs`) checks the same lines and names every missing one in a single refusal; the test
`scripts/guards.test.mjs` keeps this block and the check in step. The long form with the context rules is in
[`operator/briefs.md`](../../.claude/skills/operator/briefs.md) (Every thread brief starts with).

```
Role: <Role from docs/TEAMS.md Roster> · Kit: <kit from docs/TEAMS.md Kits> · Size: <S|M|L>
Model: <model id of the role's Roster row>
Item: <PLAN.json item M<n> or new>
Threads: <list_threads checked: none open on this topic | continues <title of the open thread>>
Prior art: <sources named: repo, path, URL, #n> -> copy | adapt | reuse | build, because <why>
Skills: <role file and skills the thread loads first>
Sheet: <path of the approved cast sheet .md, or `n/a <why this is no body, face or outfit job>`; every Programmer or Animator brief on a game or story kit>
Look-Lock: <owner card link of the approved look; not needed with `Sheet: n/a`>
Round: <n> (delete unless a gate round)
Asset: <owner/repo#n> (with Round)
Picture card: <link | none, because <why>> (delete unless a look is new)
Researcher: <subagent and model, only when the task asks for research>
Tester: <Tester thread, size L Programmer briefs only>
Done when: <command and expected output, or the screenshot that proves it>
Stop when: <rounds or attempts, never tokens>
Start: read MEMORY.md first, then <the files this task needs>
```
