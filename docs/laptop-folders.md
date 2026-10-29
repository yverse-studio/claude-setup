# Laptop folders (Claude user, Windows)

One rule for every session, including OpenCode and Luna 2: **each folder holds one kind of thing, and each thing exists once.**
The live map with today's contents is `C:\Users\Claude\Documents\ORDNER.md`; this page is the rule behind it.

```
C:\Users\Claude\
  Documents\
    GitHub\            only git clones (one per repo) and _worktrees\<repo>\<branch>; nothing else
    Games\<game>\      builds and release zips of a game (not a repo), store-capsules\ for store art
    GameAssetLibrary\  the one 3D and art source (its README is the source of truth)
    References\        reference material and inputs that are not code (watch\, social-media-manager\)
    Archiv\            old things kept to look up; nothing reads from here
    ORDNER.md          the live map; update it in the same change that moves a folder
  Private18\           private content, never in any git remote; ref\ holds private references
  tools\  twin-tools\  tools and their venvs (venvs hold absolute paths: never move a folder with a venv)
  _backup-bundles-*\   git bundles of unpushed work, delete when pushed
  _trash-*\            moved instead of deleted, emptied after 7 days
```

## Rules
- A new clone goes into `Documents\GitHub\`, a new game build into `Documents\Games\<game>\`, new art into
  `GameAssetLibrary`, a reference into `References\` (private ones into `Private18\ref\`). Never "somewhere next to it".
- Downloads, zips and loose notes are not left in any of these; they go to `GameAssetLibrary\temp\` (art) or `Archiv\`.
- Moving or renaming a folder changes, in the same change: `ORDNER.md`, every doc and script that names the old path
  (`grep` the old path in claude-setup, the clones and `~/.config/opencode`), and the allow lines in `~/.claude/settings.json`.
  Then check the desktop links (`Desktop\*.lnk` targets and working directories exist).
- Move to `_trash-*`, never delete; a folder with a venv or a running tool is not moved.
- OpenCode and Luna 2 read `AGENTS.md` first, which points to `ORDNER.md`.
