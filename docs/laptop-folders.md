# Laptop folders (Claude user, Windows)

One rule for every session, including OpenCode and Luna 2: **everything we work on lives in `C:\Users\Claude\Documents\`,
each folder holds one kind of thing, and each thing exists once.** The live map with today's contents is
`Documents\ORDNER.md`; this page is the rule behind it.

```
C:\Users\Claude\Documents\
  GitHub\            only git clones (one per repo) and _worktrees\<repo>\<branch>; nothing else
  Games\<game>\      builds and release zips of a game (not a repo), store-capsules\ for store art
  GameAssetLibrary\  the one 3D and art source, incl. scenes\ (its README is the source of truth)
  Private18\         18+ content that must never reach a git remote (renders\, ref\, backups); the 18+ game code
                     and story live in their private repo, not here
  References\        reference material and inputs that are not code (watch\, social-media-manager\)
  Tools\             portable tools (Ren'Py SDK); installers do not go here
  Archiv\            old things kept to look up; nothing reads from here
  pov-test\          experiment with a venv (venvs hold absolute paths: such a folder is not moved)
  Database.kdbx      password database
  ORDNER.md          the live map; update it in the same change that moves a folder
C:\Users\Claude\     only system folders, twin-tools\ (35 GB, venv, Twin on hold), the bundle and trash folders:
  _backup-bundles-*\ git bundles of unpushed work, delete when pushed
  _trash-*\          moved instead of deleted, emptied after 7 days
```

## Rules
- A new clone goes into `GitHub\`, a game build into `Games\<game>\`, new art into `GameAssetLibrary`, a reference
  into `References\` (a private one into `Private18\ref\`). Never "somewhere next to it", never loose in the profile root.
- Downloads, zips and loose notes are not left in any of these; they go to `GameAssetLibrary\temp\` (art) or `Archiv\`.
- Moving or renaming a folder changes, in the same change: `ORDNER.md`, every doc and script that names the old path
  (`grep` the old path in claude-setup, the clones, the art library and `~/.config/opencode`), and the allow lines in
  `~/.claude/settings.json`. Then check the desktop links (`Desktop\*.lnk` targets and working directories exist).
- Move to `_trash-*`, never delete; a folder with a venv or a running tool or render job is not moved.
- Where the current file of a character, clip or scene lives, and how work copies are archived: [One source, kept clean](game-pipeline.md#one-source-kept-clean).
- OpenCode and Luna 2 read `AGENTS.md` first, which points to `ORDNER.md`.

## Where reference images go
Art references (poses, bodies, scene look, boards, video frames) go to `GameAssetLibrary\references\` and nowhere else;
character-bound ones to that character's `Image\ref`; 18+ ones to `Private18\ref\`; social-media references (Dandadan remake, beat maps, shotlists, post analyses) to `References\social-media\`; video analysis output to `References\watch\`.
Whoever downloads or generates a reference saves it there in the same turn and adds one line with the source link to that folder's README. A reference that exists only in a chat, a temp folder or a tool's work dir does not exist for the next session.
Motion data (BVH, FBX, anim) lives in `GameAssetLibrary\animations\`, rigs in `GameAssetLibrary\rigs\`.
