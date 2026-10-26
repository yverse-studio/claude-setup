# Offline outbox

How an app that captures on a phone keeps what yskills types or films when the network or the server fails. First built in `yverse-studio/social` (PRs 16 and 17); any product with an offline save follows it.

## Rules

- Save first, send second: the entry (the idea and its clip, if any) goes into IndexedDB before any request, shows in the list at once as "Waiting to sync", and a client-made id makes a repeated send harmless. [advisory]
- An entry leaves the outbox only when everything it holds is delivered: the idea and then its clip. An idea that arrived while its clip is still pending stays in the outbox, in the clip stage. [advisory]
- Only one named error may drop data, and only the part it names: for example `bad_ref_url` drops the reference link and keeps the idea, `idea_locked` or a clip 404 drops a clip that can no longer attach. Never drop by a class of statuses (`4xx`, `5xx`, "not ok"). [advisory]
- Any other refusal (a 403 from a passing session or origin problem, a 5xx, the network) keeps the entry, stops or skips it, and tries again when the network returns, the tab is visible or a timer fires. [advisory]
- A refused entry says so once (one toast, a "refused" tag on its card) and offers a Discard button; only the person discards. [advisory]
- The capture form clears everything it handed to the outbox, the file input included, or the next entry carries the last clip. Test it: save with a clip, then save text only, and expect no clip on the second. [advisory]
- Check these in the repo's browser capture script (`npm run capture` in social): offline save, a lost answer that must not double, a 403 that keeps the idea, a refused entry that can be discarded, no clip carry-over. [advisory]

## Lessons

- 2026-10-26 (social, PR 16): the first outbox dropped every `4xx` entry and the capture form kept the file input, so a refused idea vanished and the next text-only idea re-uploaded the last video. Gate round 2 caught both; drop by named error only, clear the form fully.
