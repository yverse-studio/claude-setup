# Gate architecture: persistent gater, fresh thread per gate, or subagent (read 2026-11-12)

Researcher report for yskills' ask of 2026-11-12 23:02. Method: [`roles/researcher.md`](../../.claude/skills/operator/roles/researcher.md), Method. Our own numbers first, then primary pages read on 2026-11-12, then the verdict.

## 1. Short answer

- Neither. A persistent gater thread for all gates is worse than today on tokens and fault tolerance, and a fresh thread per gate round is the most expensive shape of all; sections 3 and 4 hold the numbers and sources, this line is my verdict (inferred from them).
- The unit that must be fresh is the judge, not the thread: Anthropic's own wording is a "fresh subagent that never saw your conversation" (https://code.claude.com/docs/en/best-practices).
- Recommended shape: one gate seat per asset. S and M stay in the author thread as `.claude/skills/operator/gate.md:28` already says; L and owner-facing results get one gate thread per asset that serves every round; each round's judge is a fresh subagent; round 2 and later are scoped re-reviews (inferred from sections 3 and 4).
- yskills is partly right about dead loops and token burn and wrong about "quality does not improve"; the count is in section 6 ([round ledgers](/mnt/project-files/gate/)).

## 2. What runs today (our own data)

- Rule: S and M gates run in the author thread with one fresh `code-reviewer` subagent, L in a fresh gate thread (`.claude/skills/operator/gate.md:28`).
- Rule: owner-facing results at M or L need a separate Reviewer thread, added after "a self-briefed critic subagent reached him" (`.claude/skills/operator/gate.md:32`).
- Rule today: every reviewer and the L Tester are always fresh, and the guard let a new Reviewer thread start for every round (`global/team-guard.mjs:415` on main fe3c1d9).
- Practice: the M53 slices, size M, were gated by a Reviewer thread that only dispatched one subagent, for example "Reviewer thread; fresh `code-reviewer` subagent (Opus) got only the diff" ([gate report #513](/mnt/project-files/claude-setup/gate/2026-11-12-m53-slice2-pr513-round1.md)). That is a second full-price thread around one subagent call, against `.claude/skills/operator/gate.md:28`.
- Start cost of a project thread, measured from this thread's first model call: 64,139 tokens written to cache plus 46,641 read, 110,780 in total ([this thread's transcript](/root/.claude/projects/-home-user/1edb8593-0493-5c61-a7f0-214de9a5943a.jsonl), first `usage` row). The M41 audit measured 94,792 on an Opus Programmer thread the same day ([thread start cost](/mnt/project-files/claude-setup/audit/2026-11-12-thread-start-cost.md)).
- Cost is calls times context, not the start alone: "Every request sends the whole conversation" (https://code.claude.com/docs/en/best-practices); our 2026-10-04 usage was 98 % cache read ([token start cost](/mnt/project-files/claude-setup/audit/2026-10-18-token-start-cost.md)).
- A subagent's start is estimated at 10 to 15k tokens, not measured ([token start cost](/mnt/project-files/claude-setup/audit/2026-10-18-token-start-cost.md)); so a thread per gate round pays roughly seven to ten times a subagent's start before it reads a line of the diff (inferred from the two numbers).
- Rounds on 2026-11-12, counted from the ledgers of claude-setup PRs: 44 PRs, 93 rounds between 11:25 and 21:09 UTC; 41 passed; 18 passed in round 1, 17 in round 2, 4 in round 3; three assets (#444 with 10 rounds, #474 with 11, #483 with 6) took 27 of the 93 rounds ([round ledgers](/mnt/project-files/gate/)).
- Plan gates on the same day: M50 passed in 3 rounds, M53 in 2, M54 ran 6 rounds at 2.5, 3.7, 4.0, 4.3, 3.8, 4.1 and never passed ([gate reports](/mnt/project-files/claude-setup/gate/)). Rounds 5 and 6 of M54 were each "one fresh `code-reviewer` subagent (Opus, no score and no earlier verdict in its prompt)" ([round 6](/mnt/project-files/claude-setup/gate/2026-11-12-m54-proven-tools-first-plan-round6-director3.md)).
- The four M53 slices built from the gated plan each passed in one round: #502, #513, #515, #520 ([round ledgers](/mnt/project-files/gate/)).
- Laptop RAM: local sessions about 0.55 GB each, cloud threads 0 ([project memory](/tmp/claude/memory/team/silo/MEMORY.md), RAM line of 22:14). So only a gate that starts Remote Control costs RAM (inferred).
- Device access is granted per thread session: the folder tool says access holds "for THIS session only", and Remote Control "may get an approval prompt" (inferred from this thread's own tool descriptions, read 2026-11-12; no public page read).

## 3. What the best do (as read)

| Source | What it says | Verdict for us |
|---|---|---|
| Anthropic, Claude Code best practices, https://code.claude.com/docs/en/best-practices | "By someone who didn't write the code: in the terminal, /code-review reviews the diff in a fresh subagent that never saw your conversation. It isn't swayed by the reasoning that produced the code." | adopt: the judge is a fresh subagent, started from the session that holds the work |
| same page, https://code.claude.com/docs/en/best-practices | "A reviewer that's asked to find problems will always find something. If you fix every finding, you end up with extra abstraction layers and tests for cases that can't happen." | adopt: a round fails on blocking findings only; later rounds do not hunt again |
| same page, https://code.claude.com/docs/en/best-practices | "/clear between unrelated tasks. It costs nothing, and it means the next task doesn't keep paying for the previous one's history." and "a session that's collected three unrelated tasks re-reads all three on every turn of the fourth" | skip the persistent gater: a project thread has no /clear, so gate after gate piles up (the missing /clear is inferred from this thread's tool list) |
| same page, https://code.claude.com/docs/en/best-practices | "The prompt cache lasts about an hour on a subscription ... Subagents get five minutes unless you change it." | a gater woken hours later re-writes its whole history; a fresh one re-writes only the start (inferred) |
| same page, https://code.claude.com/docs/en/best-practices | the table row "When it's done": non-deterministic "A request for evidence, /goal, /code-review", deterministic "Tests, typecheck, a Stop hook, CI" | adopt: a test or probe is the enforced check, a review is the soft one |
| Anthropic, subagents, https://code.claude.com/docs/en/sub-agents | "Each subagent runs in its own context window with a custom system prompt, specific tool access, and independent permissions"; built-in ones each inherit "the parent conversation's permission rules" | adopt: a subagent judge needs no new access prompt |
| Anthropic, harness design, https://www.anthropic.com/engineering/harness-design-long-running-apps (2026-03-24) | "When asked to evaluate work they've produced, agents tend to respond by confidently praising the work"; "Separating the agent doing the work from the agent judging it proves to be a strong lever" | adopt: keep the separation, it is the load-bearing part |
| same post, https://www.anthropic.com/engineering/harness-design-long-running-apps | "the evaluator is not a fixed yes-or-no decision. It is worth the cost when the task sits beyond what the current model does reliably solo"; within that boundary "the evaluator became unnecessary overhead" | adapt: gate depth by risk, which our S, M, L sizes already do |
| same post, https://www.anthropic.com/engineering/harness-design-long-running-apps | "every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing"; he removed "one component at a time" | adopt for the cleanup: cut by ablation, not by adding rules |
| same post, https://www.anthropic.com/engineering/harness-design-long-running-apps | generator and evaluator "negotiated a sprint contract: agreeing on what 'done' looked like for that chunk of work before any code was written"; the evaluator then "used the Playwright MCP to click through the running application" | adapt for plans: agree the checks, then judge the running thing |
| same post, https://www.anthropic.com/engineering/harness-design-long-running-apps | "I regularly saw cases where I preferred a middle iteration over the last one"; scores improved "before plateauing" | supports a round cap and "pick the best eligible version" |
| same post, https://www.anthropic.com/engineering/harness-design-long-running-apps | "Out of the box, Claude is a poor QA agent"; tuning was "read the evaluator's logs, find examples where its judgment diverged from mine, and update the QAs prompt" | calibration lives in the rubric and prompt file, not in a gater's chat memory |
| Cognition, https://cognition.com/blog/multi-agents-working (2026-04-22) | "we found this technique to work best when the coding and review agents do not share any context beforehand"; "Often the system will loop through multiple code-review cycles, finding new bugs each time (which isn't always great since it can take a while)" | adopt clean context; the loop risk is known to them too |
| same post, https://cognition.com/blog/multi-agents-working | the bridge matters: the coding agent uses "its broader context of user instructions, decisions, etc. to filter the bugs that come back", which "is key to preventing looping" | adopt: the holder of the work filters findings; disputes go to the coordinator (`.claude/skills/operator/gate.md:28`) |
| superpowers 7.0.0, subagent-driven-development, https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md | "A fix round is one fix dispatch plus one scoped re-review. Five rounds maximum per task"; rounds 4-5 go to "a fresh implementer on a more capable model" | adopt the scoped re-review; our 3 + 3 rounds with a Fable director is the same idea |
| same skill, re-review prompt, installed copy `/root/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/subagent-driven-development/re-review-prompt.md:5` | "It is not a fresh review — the full review already happened." | adopt: this is the missing piece in our rounds |
| same skill, https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md | the reviewer is dispatched by the controller of the same session; "every reviewer a worker spawned duplicated the task review the controller dispatched anyway" | one review seat per asset, no second layer |
| Anthropic, multi-agent research system, https://www.anthropic.com/engineering/multi-agent-research-system | "multi-agent systems use about 15× more tokens than chats"; "most coding tasks involve fewer truly parallelizable tasks than research" | fewer threads for coding gates |
| Anthropic, Code Review product, https://code.claude.com/docs/en/code-review | "several agents examine the diff and the surrounding code in parallel"; "a verification step checks the candidate findings against the code and filters out false positives" | their judge is also per-PR agents plus a filter, no standing reviewer |
| Zheng et al. 2023, https://arxiv.org/abs/2306.05685 | LLM judges show "position, verbosity, and self-enhancement biases, as well as limited reasoning ability" | already in `.claude/skills/operator/gate.md:92`; keep |
| Panickssery et al. 2024, https://arxiv.org/abs/2404.13076 | "an LLM evaluator scores its own outputs higher than others'"; self-recognition correlates with self-preference | a fresh subagent of the same model removes shared context, not this bias; so tests and numbers come first |
| Wataoka et al. 2024, https://arxiv.org/abs/2410.21819 | "LLMs assign significantly higher evaluations to outputs with lower perplexity than human evaluators, regardless of whether the outputs were self-generated" | same: a second model family would help, but that is a paid tool, so skip |
| Our earlier report, [persistent role threads](2026-11-12-persistent-role-threads-sota.md) | reuse a role thread inside one plan or PR, fresh for a new job, reviewers with clean context | consistent with this report; this one narrows it for gates |

## 4. The options, scored

Scores are my judgment from sections 2 and 3, 1 (bad) to 5 (good); every row is inferred from the sources named in it.

| Criterion | A: fresh thread per gate round (today for L, plans, owner-facing) | B: one persistent gater thread for all gates | C: fresh subagent in the author thread (today for S, M) | D: one gate seat per asset, judge a fresh subagent (recommended) |
|---|---|---|---|---|
| Independence and bias (inferred; https://code.claude.com/docs/en/best-practices, https://cognition.com/blog/multi-agents-working) | 5: nothing shared | 4: judge fresh, but the dispatcher carries verdicts of other assets | 4: judge fresh, but the author writes the prompt | 4 to 5: as C for S and M, as A for L, since the seat is not the author |
| Quality (inferred; https://www.anthropic.com/engineering/harness-design-long-running-apps) | 3: every round reviews everything again, so it finds something new each time | 3: one long context degrades | 4 | 4 to 5: scoped re-review stops re-litigation |
| Token cost (inferred; [thread start cost](/mnt/project-files/claude-setup/audit/2026-11-12-thread-start-cost.md)) | 1: about 95 to 111k per round before work | 2: one start, then a growing history re-read on every call and re-written after each idle gap | 5: about 10 to 15k per judge | 4: C for S and M; one start per L asset instead of one per round |
| Access prompts (inferred from this thread's tool descriptions) | 1: every thread that needs the device asks again | 4: one grant | 5: none, the author already holds it | 4: one per L asset, none for S and M |
| RAM at about 0.7 GB per local session (inferred; [project memory](/tmp/claude/memory/team/silo/MEMORY.md)) | 2: one Remote Control session per gate thread that uses the laptop | 4: one | 5: none extra | 4: one per L asset that needs the laptop |
| Fault tolerance (inferred; ledger design in `.claude/skills/operator/gate.md:246`) | 5: a dead thread loses one round, the ledger holds the count | 1: one hung or confused gater stops every gate, and three Programmers queue behind it | 4: dies with the author thread, the ledger and PR stay | 4: a dead seat is replaced with `Reuse: none (<why>)` |
| Total (inferred) | 17 | 18 | 27 | 24 to 26 |

- C scores highest but cannot stand alone: for owner-facing results the author-briefed subagent already failed once in practice (`.claude/skills/operator/gate.md:32`), so L and owner-facing results keep a seat outside the author (inferred).
- B's one real advantage, a single device grant, is bought with a single point of failure and a history that the best-practices page tells you to clear between unrelated tasks (https://code.claude.com/docs/en/best-practices).

## 5. "The author never gates himself": does the subagent pattern break it

- In the letter, no: the verdict comes from a context that did not write the work, and the hook counts a verdict only "when a real reviewer agent ... of the session returned that headline as the opening of its own result, from a prompt that did not hold it" (`.claude/skills/operator/gate.md:246`).
- In effect, two holes remain. First, the author writes the judge's prompt; superpowers warns that a prompt holding "do not flag," means "you are pre-judging, usually to spare yourself a review loop" (https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md). Second, the author decides whether a verdict is posted: "the hook does not know who posts a verdict" (`.claude/skills/operator/gate.md:260`), so a bad round can be dropped and asked again (the re-roll is inferred from that line; I did not test it).
- The fix for both is mechanical and is step 3 of the plan below: the ledger counts the reviewer subagent's verdict when it returns, and the judge's prompt comes from one fixed file (inferred).

## 6. Is the setup dead-looping and burning tokens (yskills' second ask)

- Right, on cost: 44 PRs and 93 counted gate rounds on claude-setup itself in under ten hours of one day ([round ledgers](/mnt/project-files/gate/)); each thread starts at 95 to 111k tokens (section 2); `node scripts/rule-budget.mjs` prints 328 unguarded rule lines in 53 files (run 2026-11-12 on main fe3c1d9, [`scripts/rule-budget.mjs`](../../scripts/rule-budget.mjs)).
- Right, on dead loops, but they are concentrated: three PRs took 27 of 93 rounds and the M54 plan took six more without a pass ([round ledgers](/mnt/project-files/gate/)).
- Right, on "not SOTA", in one sense: Anthropic removes harness parts that are not load-bearing and calls an evaluator inside the model's reach "unnecessary overhead" (https://www.anthropic.com/engineering/harness-design-long-running-apps); we mostly add parts ([why failures repeat](/mnt/project-files/claude-setup/2026-11-12-why-failures-repeat.md)).
- Wrong, on "quality does not improve": 35 of the 41 passed PRs needed at most two rounds, and all 17 two-round PRs went from a fail to a pass after one fix ([round ledgers](/mnt/project-files/gate/)). The PR gate converges; the plan gate and three assets did not.
- Wrong, on "nobody really works", as far as the count goes: 41 gated merges in one day is work, but it is work on the setup, not on a product ([round ledgers](/mnt/project-files/gate/)); whether that is the right place for the hours is his call, not a finding.
- What a cleanup should be: the paused M27 rule cut, done by ablation (remove one part, watch the ledger numbers of a week, keep the removal if nothing got worse), as the harness post describes (https://www.anthropic.com/engineering/harness-design-long-running-apps). It needs its own Planner thread on Fable; this thread only reports (inferred from `docs/TEAMS.md:207`, one thread per plan).

## 7. Plan gates against tests

- Data point: six scored rounds on the M54 plan text never passed ([gate reports](/mnt/project-files/claude-setup/gate/)), while one probe run against the real hook printed every refusal case of the CompanyXY report in one go ([probe](/mnt/project-files/claude-setup/workflow-fable/2026-11-12-companyxy-probe.md)).
- Counter data point: the M53 plan passed in two rounds and its four slices each passed in one ([round ledgers](/mnt/project-files/gate/)); I cannot say the plan gate caused that (inferred, no control).
- The sources put the weight on running checks: "Tests, typecheck, a Stop hook, CI" are the enforced column (https://code.claude.com/docs/en/best-practices), and Anthropic's evaluator judges the running app against a contract agreed before the code (https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Verdict: a plan gate should be a contract check with a yes or no, not a 0 to 5 score on prose: does every `Done when` name a check that can run, and was every claim about existing code probed on the real path. One round plus one scoped re-review; the hard counter stays as the backstop (inferred from the three lines above).
- This changes the flow yskills set at 13:39 ("plan final, independent Fable gate, execute at 5/5", [project memory](/tmp/claude/memory/team/silo/MEMORY.md)), so it is his card, not part of this PR.

## 8. Recommendation

1. One gate seat per asset. S and M: the author thread with a fresh `code-reviewer` subagent, no extra Reviewer thread. L and owner-facing results: one gate thread per asset, which serves every round by `message_thread` (inferred from sections 3 and 4; guard drafted in the [step 1 patch](2026-11-12-gate-architecture-step1.patch), not merged).
2. The judge of every round is a fresh subagent that sees only the evidence (https://code.claude.com/docs/en/best-practices).
3. Round 2 and later are scoped re-reviews: each blocking finding addressed or not, plus new breakage in the fix diff (https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md; rule text drafted in the [step 1 patch](2026-11-12-gate-architecture-step1.patch), today's line is `.claude/skills/operator/gate.md:202`).
4. No persistent gater for all gates (section 4, inferred).
5. Tests and probes before plan scores (section 7, inferred).

## 9. Migration plan

| Step | What | How it is checked | Undo |
|---|---|---|---|
| 1, drafted as the [step 1 patch](2026-11-12-gate-architecture-step1.patch), not opened as a PR: the coordinator reported a setup freeze until 2026-11-26 | the guard stops a new gate thread for round 2+ of a PR whose gate thread is open; `gate.md` Rounds makes round 2+ a scoped re-review; the card line and the Round line of `briefs/reviewer.md` and `briefs/tester.md` say so | `scripts/guards.test.mjs` (test "reuses an open role thread"), `node scripts/pre-pr.mjs`; state on 2026-11-12: the new guard test passes, pre-pr is still red on 2 points (`cloud/setup.sh` copy not synced, 5 tests, not yet read) (inferred: my own run) | revert the PR |
| 2 | gate threads need no laptop: builders put evidence under `/mnt/project-files/`, as `.claude/skills/operator/gate.md:41` already asks for assets; first count which gate threads asked for the device this week | a count from the thread transcripts; then a guard on `start_remote_control` in a Reviewer session | revert |
| 3 | the ledger counts a reviewer subagent's verdict when it returns, and the judge's prompt is one fixed file; closes the two holes of section 5 (inferred) | a test that an unposted fail still counts as a round | revert |
| 4 | card to yskills: plan gates become a contract check (section 7) or stay scored; recommended: contract check (inferred) | his tap | none needed |
| 5 | M gates stop getting a Reviewer thread around one subagent: find which brief line caused it for #502 and #513, most likely the `Gate:` line of `.claude/skills/operator/gate.md:32` read as "always a thread" (inferred, not traced) | threads started per merged PR, from `scripts/brief-stats.mjs` (inferred: the script exists, I did not run it) | revert |
| 6 | one week later, read the ledgers again: rounds per asset, share passed within two rounds (today 35 of 41), assets over three rounds (today 3 of 44) ([round ledgers](/mnt/project-files/gate/)) | this table, filled in | steps 1 to 5 are reverted if the share drops |

Order, after the freeze ends: 1 first; 3 and 5 next as small Programmer PRs; 2 after its count; 4 when yskills answers; 6 on 2026-11-19 (inferred: my proposal, the coordinator schedules it).

## 10. Open questions (each with a recommended answer)

- Should plan gates lose the 0 to 5 score? Recommended: yes, section 7; card to yskills (inferred).
- Should the cleanup (M27) restart now? Recommended: yes, as an ablation plan by a Fable Planner, after the freeze (inferred from section 6).
- Should a second model family judge taste gates, since same-family judges share a bias (https://arxiv.org/abs/2410.21819)? Recommended: no, it is a paid tool and the brief forbids one.

## 11. Sources

- https://code.claude.com/docs/en/best-practices : review by a fresh subagent, "always find something", /clear, cache lifetime, the deterministic column. Read 2026-11-12.
- https://code.claude.com/docs/en/sub-agents : own context window, inherited permission rules. Read 2026-11-12 (first 40k characters of the page).
- https://code.claude.com/docs/en/code-review : several agents plus a verification step. Read 2026-11-12.
- https://www.anthropic.com/engineering/harness-design-long-running-apps : generator and evaluator, sprint contract, evaluator as overhead, ablation. Read 2026-11-12.
- https://www.anthropic.com/engineering/multi-agent-research-system : 15x tokens, coding less parallel. Read 2026-11-12.
- https://www.anthropic.com/engineering/building-effective-agents : evaluator-optimizer, "simplest solution possible". Read 2026-11-12.
- https://cognition.com/blog/multi-agents-working : clean-context reviewer, review loops, the bridge. Read 2026-11-12.
- https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md and the installed 7.0.0 copy: fix loop, scoped re-review, five rounds. Read 2026-11-12.
- https://arxiv.org/abs/2306.05685 , https://arxiv.org/abs/2404.13076 , https://arxiv.org/abs/2410.21819 : judge biases. Abstracts only, read 2026-11-12.
- Ours: `.claude/skills/operator/gate.md:28`, `docs/TEAMS.md:207`, `docs/WORKFLOW.md:38`, [round ledgers](/mnt/project-files/gate/), [gate reports](/mnt/project-files/claude-setup/gate/), [persistent role threads](2026-11-12-persistent-role-threads-sota.md). Read 2026-11-12.

Not checked:
- The full papers behind the three arXiv abstracts; only the abstracts were read.
- Google's "Modern Code Review" (the PDF came back unreadable) and Bacchelli and Bird 2013 (HTTP 403): no claim here rests on them.
- The Claude Code agent-teams and costs pages beyond a keyword search; no claim rests on them.
- A measured token count of a reviewer subagent; the 10 to 15k is the 2026-10-18 estimate.
- Which gate threads really asked for the laptop or Remote Control; I cannot read other threads' transcripts from here.
- Whether the round-1 fails of the 17 two-round PRs were real defects; I read scores, not the findings.
- Whether a project thread can clear its context; I found no tool for it and no documentation page.
- HN and Reddit threads: none read; the vendor pages and two public repos answered the question.
