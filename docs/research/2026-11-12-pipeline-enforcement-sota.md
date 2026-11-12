# Pipeline enforcement SOTA (2026-11-12)

Three topics, checked against what we already have. Standard web search only; claims marked "unverified" were not confirmed by a source.

## What we already have
- `global/team-guard.mjs`: `missingLines(text)` checks a thread brief for 5 regex lines (Model, Skills, Done when, Stop when, Start/MEMORY.md) plus a Researcher line when the task asks for research. `decide()` also checks stamp, kit, size, role, title, Prior art, Tester, model tier. A block is exit 2 from a PreToolUse hook.
- `scripts/laptop-slots.mjs`: counting lock (max 2 renders), one `render-N.lock` per job with the pid inside, created with `wx` (O_EXCL). A dead pid is taken over by renaming the stale file aside. Blender instances are counted through `tasklist`.
- `scripts/laptop-job.mjs`: watchdog over stdout/stderr activity (HANG after `--idle-min`), TIMEOUT, STOP file, queue wait, RAM and GPU gates, keep-awake, one `JOB ...` result line. It has NO progress file, NO checkpoint and NO resume.

## 1. Validate a brief before a worker starts
- SOTA: a schema or template is checked before the receiver starts, and an invalid brief is rejected with the full list of missing fields. Claude Code does this with a PreToolUse hook: exit 2 blocks the call and feeds stderr back to the model; exit 1 does NOT block.
- A reported bug says exit 2 did not block Write/Edit in one version, so test enforcement on the version in use.
- Sources: https://docs.anthropic.com/en/docs/claude-code/hooks ; https://community.deeplearning.ai/t/a-handoff-contract-for-delegating-multi-step-work-to-ai-tools-what-would-you-put-in-it/895416 ; https://github.com/anthropics/claude-code/issues/13744
- Verdict: **adapt**. We already reject-before-start. Gaps: regexes check that a line exists, not that its value is sane (e.g. `Done when:` can be one word); and the result is a single pass/fail string. Adapt: a small declarative field table (name, regex, min length) in one place, return all failures at once (we already do), and check the same table in a test. No JSON-schema library needed.

## 2. Heartbeat plus resumable progress file for long jobs
- SOTA, Temporal: an activity sends heartbeats carrying progress details; if heartbeats stop for the heartbeat timeout, the activity is timed out and retried, and the retry receives the last heartbeat details so it resumes from the checkpoint. It needs a retry policy.
- SOTA, Blender: with Overwrite off, a re-run skips frames already on disk, so a render resumes from its output folder. The Placeholders plus Overwrite-off combination is not documented as intended (unverified; forum doubt).
- Sources: https://docs.temporal.io/design-patterns/long-running-activity ; https://docs.blender.org/manual/sl/latest/render/output/animation.html ; https://blenderartists.org/t/blender-placeholders-creates-duplicates/663434
- Verdict: **adapt**. Our watchdog uses output silence only, which a Blender frame that renders quietly for 10+ minutes can trip, or a hung process that still prints can dodge. Adapt in about 30 lines: (a) the job or its wrapper touches/writes `<name>.progress.json` (`{frame, total, ts}`); (b) `laptop-job.mjs` also treats progress-file mtime as a heartbeat (`--progress-file`, max of output time and mtime); (c) resume = list the existing output frames, render only missing ones, Overwrite off (frame files are the checkpoint, so no extra state). Do not rely on Placeholders. Not a Temporal build.

## 3. Global single-instance lock for a heavy process
- SOTA: lock file created with O_EXCL (or mkdir, atomic on POSIX) holding the pid; a stale lock is detected by a dead pid. py-filelock also stores the hostname, and on Windows the process creation time to defeat pid reuse. Known pitfall: with rename-aside takeover there is a short window where the path is missing and an unrelated O_EXCL create can succeed. Lock files are advisory and pid checks do not work across machines or over NFS.
- Windows: a file cannot be deleted while another handle is open, so cleanup can fail. mkdir atomicity on Windows is unverified by any source found.
- Sources: https://py-filelock.readthedocs.io/en/latest/concepts.html ; https://mywiki.wooledge.org/BashFAQ/045 ; https://pkg.go.dev/github.com/Gitlawb/zero/internal/lockutil
- Verdict: **copy** (already built). `laptop-slots.mjs` has O_EXCL (`wx`), pid liveness, rename-aside takeover and handles the lost-race case by restoring the file. Remaining small gaps, both optional: (a) pid reuse on Windows (a dead job's pid reused by another process looks alive, so a slot stays held; fix: also store process start time, or accept an age cap with the progress heartbeat from topic 2); (b) a crashed watchdog leaves the lock until its pid dies, which is the intended behaviour.

## Suggested order
1. Heartbeat from progress-file mtime in `laptop-job.mjs` plus a frame-skip resume recipe (largest real gap).
2. Field-table brief check with minimum content, only if a bad brief gets through again.
3. Leave the slot lock alone unless a stuck slot from pid reuse is seen.
