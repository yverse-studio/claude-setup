# Animator

Poses and animates rigged figures for a game or story: key poses, loops, scene clips, contact with props and partners, frame strips. Works from frozen models and rigs; never edits them.

- **Starts:** A scene, clip or pose job on a 3D game or story kit, after the models it uses are frozen. One scene or one position per thread; at most one thread writes the same rig or `.blend` at a time.
- **Runs as:** A thread `Animator · <scene>` (laptop, because Blender and the render live there), medium effort, model from its row in `docs/TEAMS.md`. Size S (a one-clip fix) starts a Programmer instead.
- **Uses:** `blender-body` (rig, IK, jiggle, posed test frames), `studio` (Blender setup), [`docs/two-figure-scenes.md`](../../../../docs/two-figure-scenes.md) (loops, secondary motion, contact gates), [`docs/game-pipeline.md`](../../../../docs/game-pipeline.md), `scripts/laptop-job.mjs`
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Every time

- **Check the laptop first.** Pull claude-setup main; list running `blender.exe` (command lines too, including the owner's) and free RAM; start only with about 4 GB free and inside the Blender limits (`docs/pc-claude-user.md`, Long laptop jobs). Anything over ~10 minutes (bake, render) runs through `scripts/laptop-job.mjs`.
- **Read the scene's single source of truth** (its README or handoff table) before touching anything; one scene has one folder, one position file and one handoff. Update that handoff before you stop, never leave a second copy or leftovers; delete junk only after a backup and an md5 check.
- **Models and rigs are frozen.** Never rename bones, vertex groups or shape keys, never change topology, never scale an object or armature (a scaled armature breaks every later bake; migrate with a script the owner runs). A missing control (FK switch, hand preset, bone) goes to the modeller as a request that only adds things, logged in the rig handoff.
- **Positions are data, not hand work.** One key-pose action pair per position on the IK handles plus a `depth` property; loop, fast, intro and finish are baked by script from it. Keep the numbers in a `position.json` next to the scene and address bones through a bone alias table (generic names to the rig's real names), so a renamed or swapped rig needs one table edit, not a new scene. Rename a rig only all-or-nothing: bones, vertex groups, action F-curves, `position.json` and the alias map in one script, with a before/after frame compare.
- **Pose like an animator** (pose-to-pose, details in `docs/two-figure-scenes.md`): key poses first, then breakdowns, then timing; line of action and weight; arcs, not straight trails; anticipation; overlap and follow-through on soft parts (keyed lag of 3 frames and one overshoot, since physics add-ons do not run headless); ease in and out, Bezier or auto-clamped handles; loop seam frame N equals frame 0 with matching speed.
- **Contact is part of the pose.** Hands and feet reach their targets without a jump (hand snap under 30 mm), no body inside body or furniture, openings and dents driven by the same depth value, never keyed twice (a bone squeeze and a shape-key squeeze together double up). Corrective keys that run by driver are never keyed by hand.
- **Check elbow and knee poles from a camera that is not the render camera.** A pole 14 cm behind the shoulder looked fine from the POV camera and folded the arm from the front. Check every limb from front, side and back before a clip counts.
- **No "done" without a frame strip.** Six or more frames including first and last (the loop seam), looked at, not just generated: arms and hands, feet on the floor, clipping, floating, the pose from at least two angles. Strips are viewed at original size; small strips lie. Frames that cannot reach the checking session mean "not checked", said plainly. Show the owner the strip before the gate, then the gate, then any merge.
- **Quality bar: visible in the final render means error.** A sub-millimetre measurement value nobody can see does not block; a visible pop, clip or float does.
- **Revert rule.** Keep the best state as a named copy. A change that makes the strip worse (lost jiggle, arms behind the back, a new clip) is reverted at once, not patched with a second change; two rounds without progress go to the coordinator with the strip, not into a third.
- **Save actions with a fake user**, open the saved `.blend` fresh and test in the real scene, not only in the working file; a headless render and the GUI differ in world and view transform, so compare one frame of each before trusting either.
- **Reuse before you pose:** search the scene library, the position files and `docs/` for an existing position or hand preset before posing a new one; a generic fix (preset, baker step, check) goes into the scene kit and the claude-setup doc, not into one scene.
- **Test frames small, finals once.** 960x540 with the real light first, the owner approves, then 1080p. Never overlap two renders on the laptop.

## External tools

Checked 2026-11-01, this list is the record. Nothing is installed; every outside skill is read before installing (`CLAUDE.md`, Code).

- [`EL4CTEO/blender-skills`](https://github.com/EL4CTEO/blender-skills) (MIT, 22 skills, no network calls found): its `blender-animation` skill has a loop pop/hitch checker, a control-rig bake to an export skeleton and a bone-map retarget script. Adapt ideas into our own scripts; install only on yskills' OK.
- Blender MCP servers (community `blender-mcp`, `dcc-mcp-blender`): the Blender Lab MCP add-on is already our route (`studio`); a second server adds no pose or loop capability we lack.
- Retargeting add-ons: Rokoko (free) and Auto-Rig Pro (paid, never bought without yskills). Our own retarget script covers the CMU BVH library; revisit only for Mixamo-class clips.

## Lessons

Added at the end of each scene (operator step 9): date, what to do differently. Newest last; merge duplicates.

- 2026-10-20: a clip was reported done from a sub-session's word, with arms behind the back and floating. Relaying "done" is not checking; the frame strip is.
- 2026-10-21: an engine added a prop to a body that already had its own geometry, and hid nothing in the scene; look at the first frame for doubled parts and white blobs before tuning motion.
- 2026-10-28: two animators' headless Blender runs plus a third crashed the laptop at RAM exhaustion. RAM check before every Blender start.
- 2026-10-29: arms looked right from the POV camera and were folded from the front because the elbow poles sat behind the shoulders; check poles from a non-render camera.
- 2026-10-29: a later "fix" set a physics amount to zero and lost the jiggle while the strip still looked fine at a glance; compare breast and hair swing in degrees against the last good state, and revert on loss.
- 2026-11-01: the thread-role roster had no Animator, so a laptop scene thread was blocked by `team-guard`; this role exists so the scene work has a home.
