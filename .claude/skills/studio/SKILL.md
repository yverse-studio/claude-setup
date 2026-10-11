---
name: studio
description: "Work in Roblox Studio or Blender through their MCP servers on yskills' PC: setup check, build loop, and live frames yskills can watch in HQ. Use whenever a task touches Studio, Blender, a Roblox place or a 3D model."
---

# Studio and Blender

Both servers run only on yskills' PC with the app open, so this work happens in a Remote Control
thread or Claude Code there. Cloud threads write code and tests (`roblox`, `toolbox` `catalog/roblox.md`,
`game-3d`) and hand the visual part to the PC.

## Setup (once per PC)

| App | How it is connected | Check |
|---|---|---|
| Roblox Studio | Built in: Studio > Assistant > `…` > Manage MCP Servers > Enable Studio as MCP server > Quick connect > Claude Code ([docs](https://create.roblox.com/docs/studio/mcp)). Writes `Roblox_Studio` (`cmd /c %LOCALAPPDATA%\Roblox\mcp.bat`) into `~/.claude.json`. | `list_roblox_studios` names the open place |
| Blender | The official Blender Lab connector ([releases](https://projects.blender.org/lab/blender_mcp/releases), Blender 5.1+). Add-on: `blender --command extension install-file -r user_default -e mcp-<ver>.zip`, then Auto Start and Online Access on in its preferences. Server: unzip the `.mcpb` to `~/.claude/mcp/blender-mcp`, then `claude mcp add --scope user Blender -- uv run --directory <that folder> blender-mcp` (the live hook matches the name `Blender`). Skip look-alike community servers. | `get_objects_summary` returns the scene |

`node install.mjs` adds the live-frame hook below; nothing else to install.

## Build loop

1. Look first: `list_roblox_studios` (pick by name, every call needs its `studio_id`),
   `search_game_tree` / `inspect_instance`, or Blender's `get_objects_summary`. Never assume
   names or sizes; never delete or overwrite what yskills made without asking.
2. Change in small steps: `execute_luau` / `multi_edit` in Studio, operators or `execute_blender_code`
   in Blender. Scripts that matter live in the repo (Rojo) so they get a PR and tests.
3. See it: `screen_capture` (Studio, any camera) or `get_screenshot_of_window_as_image` (Blender);
   in Studio also `start_stop_play` + `get_console_output` for a real playtest.
4. Ship: Studio places publish from CI, models export as `.glb` into the repo
   (`game-3d`). "Done" carries a screenshot from step 3.

## Live frames in HQ

yskills watches from HQ's Team page ("Live in Studio und Blender"): one small monitor per app with
the last frame, a caption and a link to the thread.

- The `live-hook.mjs` PostToolUse hook captures the app's window after Studio or Blender tool
  calls (once per 20 s per app, even when covered) to `%LOCALAPPDATA%\claude-live\<app>.jpg` and
  `<app>.json`. It costs no tokens.
- After each visible milestone (a building placed, a model shaped, a playtest run), and at least
  every 15 minutes while working, send the frame with a caption:
  1. `pwsh ~/.claude/claude-setup/live-shot.ps1 -App studio -Caption "Zaun um Parzelle 3 gebaut" -Link <thread link>`
     (German caption, what changed for yskills);
  2. `ArtifactData` `set`, `url` https://claude.ai/artifact/TmQ7UpL6EPjXKkpR9S4kJT, collection
     `live`, doc `studio` or `blender`, `file_path` the `.json` above, `if_version` from your last
     write's result (first push of a session: `get` it with `out_dir` for the version). The image
     stays out of the context; never paste it. Two docs overwritten in place keep the database
     small, so no asset uploads.
- HQ shows a frame up to 12 hours old, with a green "live" chip for the first 10 minutes.
- On the PC itself yskills just looks at the windows; the frames are for the phone and for later.
