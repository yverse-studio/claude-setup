# Laptop folders (Claude user, Windows)

One rule for every session, including OpenCode and Luna 2: **everything we work on lives in `C:\Users\Claude\Documents\`,
each folder holds one kind of thing, and each thing exists once.** The live map with today's contents is
`Documents\START.md`; this page is the rule behind it.

```
C:\Users\Claude\Documents\
  GitHub\            only git clones (one per repo) and _worktrees\<repo>\<branch>; nothing else
  lib\               the one 3D and art source by type: characters\, clothes\, rooms\, props\, anims\, sounds\, vroid\ (its README is the source of truth)
  projects\games\<game>\  scenes and chapters (ch01\ ...), build\ = Ren'Py build and release zips (not a repo), store-capsules
  tools\             laptop, anim, gate scripts; apps\ = portable tools (Ren'Py SDK)
  docs\              pipeline, handoff, logs
  reference\         reference material (poses, scene look, boards, social-media, watch)
  _inbox\ _work\ _queue\ _archive\   downloads, scratch, render queue, kept old things
  Private18\         18+ content that must never reach a git remote (renders\, ref\, teardowns\ = unpacked third-party games and rips, backups); the 18+ game code
                     and story live in their private repo, not here
  pov-test\          experiment with a venv (venvs hold absolute paths: such a folder is not moved)
  Database.kdbx      password database
  START.md           the live map (replaces ORDNER.md); update it in the same change that moves a folder
C:\Users\Claude\     only system folders, twin-tools\ (35 GB, venv, Twin on hold), the bundle and trash folders:
  _backup-bundles-*\ git bundles of unpushed work, delete when pushed
  _trash-*\          moved instead of deleted, emptied after 7 days
```

## Rules
- A new clone goes into `GitHub\`, a game build into `projects\games\<game>\build\`, new art into `lib\`, a reference
  into `reference\` (a private one into `Private18\ref\`). Never "somewhere next to it", never loose in the profile root.
- Downloads, zips and loose notes are not left in any of these; they go to `_inbox\` (art) or `_archive\`.
- Moving or renaming a folder changes, in the same change: `START.md`, every doc and script that names the old path
  (`grep` the old path in claude-setup, the clones, the art library and `~/.config/opencode`), and the allow lines in
  `~/.claude/settings.json`. Then check the desktop links (`Desktop\*.lnk` targets and working directories exist).
- Move to `_trash-*`, never delete; a folder with a venv or a running tool or render job is not moved.
- Where the current file of a character, clip or scene lives, and how work copies are archived: [One source, kept clean](game-pipeline.md#one-source-kept-clean).
- OpenCode and Luna 2 read `AGENTS.md` first, which points to `START.md`.

## Where reference images go
Art references (poses, bodies, scene look, boards, video frames) go to `reference\` and nowhere else;
character-bound ones to that character's `Image\ref`; 18+ ones to `Private18\ref\`; social-media references (Dandadan remake, beat maps, shotlists, post analyses) to `reference\social-media\`; video analysis output to `reference\watch\`.
Whoever downloads or generates a reference saves it there in the same turn and adds one line with the source link to that folder's README. A reference that exists only in a chat, a temp folder or a tool's work dir does not exist for the next session.
Motion data (BVH, FBX, anim) lives in `lib\anims\` (two-person rigs in `lib\anims\interaction\`).
