# NOW: who is doing what

One live board per project at `/mnt/project-files/NOW.md` (network mount: trailing-slash path, re-read ~10 s after writing). Rule: `docs/USING.md` (Live board). Every job writes one line when it starts and updates that same line when it ends; a done line older than 24 h moves to `NOW-archive.md`. Never edit another job's line except to mark it `failed` when its owner is gone.

`WHO.md` stays the hard lock for the Blender lane only; NOW.md is awareness, not a lock.

| time (UTC) | who (thread title + link) | model | what | status | waiting on |
|---|---|---|---|---|---|
| 2026-11-10 17:20 | [Add live NOW.md board rule](#cmsg_example) | <model id> | PR for the NOW.md rule | running | - |
