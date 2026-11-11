# NOW: who is doing what

One live board per project at `/mnt/project-files/NOW.md` (network mount: trailing-slash path, re-read ~10 s after writing). Rule: `docs/USING.md` (Live board). Every job writes one line when it starts and updates that same line when it ends; a done line older than 24 h moves to `NOW-archive.md`. Edit only your own line; the coordinator's sweep archives done lines and marks dead `running` ones `failed` (`docs/USING.md`, Live board step 4).

The Blender lane lock stays `_claude/_queue/WHO.md` on the laptop; NOW.md is awareness, not a lock.

| time (UTC) | who (thread title + link) | model | what | status | waiting on |
|---|---|---|---|---|---|
| 2026-11-10 17:20 | [Add live NOW.md board rule](#cmsg_example) | <model id> | PR for the NOW.md rule | running | - |
