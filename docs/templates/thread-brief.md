# Thread brief template

The one fixed shape of a thread brief (companyxy 2026-11-12: almost every start failed the brief check one line at a
time, an extra round each). Copy the block, fill every `<...>`, one field per line, then start the thread. `BRIEF_FIELDS`
(`global/team-guard.mjs`) is the one table of these lines: only a gap only the coordinator can decide (role, kit, size, and at size M or L Item, Plan,
Acceptance) is refused, all of them in one refusal with the role's template; the thread repairs the rest. `scripts/brief-fields.test.mjs` keeps this block and the table in step. The long form with the context rules is in
[`operator/briefs.md`](../../.claude/skills/operator/briefs.md) (Every thread brief starts with).

```
Role: <Role from docs/TEAMS.md Roster> · Kit: <kit from docs/TEAMS.md Kits> · Size: <S|M|L>
Model: <model id of the role's Roster row>
Item: <PLAN.json item M<n> or new>
Plan: <plan file or card it builds>
Acceptance: <what counts as accepted>
Threads: <list_threads checked: none open on this topic | continues <title of the open thread>>
Prior art: <sources named: repo, path, URL, #n> -> copy | adapt | reuse | build, because <why>
Skills: <role file and skills the thread loads first>
Sheet: <approved cast sheet .md, or `n/a <why no body, face or outfit job>`; Programmer or Animator on a game or story kit>
Look-Lock: <owner card link of the approved look; not needed with `Sheet: n/a`>
Round: <n> (gate rounds only)
Asset: <owner/repo#n> (with Round)
Picture card: <link | none, because <why>> (new look only)
Researcher: <subagent and model; research tasks only>
Tester: <Tester thread; size L Programmer only>
Gate: <Reviewer thread> before owner (M or L)
Done when: <command and expected output, or the screenshot that proves it>
Stop when: <rounds or attempts, never tokens>
Start: read MEMORY.md first, then <the files this task needs>
```
