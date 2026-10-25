# Blender POV test (2026-10-25, headless, no GPU)

Run both scripts from the folder that holds `scene.blend` (`pov.py` opens it from the current directory and imports the second character from `/mnt/project-files/claude-setup/hq-characters/remix/rosa.vrm`, edit that path). `pip install bpy` (Blender 5.2 as a Python module, works in the cloud container, Cycles on CPU).

```bash
python3 -I scene.py . /path/to/character.vrm     # blockout + VRM import (glTF importer reads VRM) -> scene.blend
mkdir frames && python3 -I pov.py -- $PWD/frames  # POV camera at the head, arms posed, fire from noise x voronoi nodes
ffmpeg -framerate 12 -i frames/f%03d.png -vf "minterpolate=fps=24:mi_mode=blend,format=yuv420p" -c:v libx264 -crf 20 out.mp4
```

Learned (v1 clip: `/mnt/project-files/claude-setup/video-tests/2026-10-25-pov-firebend-v1.mp4`, 72 frames, 8 samples, ~6 min on CPU):
- Rotate a pose bone around its own head: `Matrix.Translation(h) @ Rotation @ Translation(-h) @ b.matrix`. Rotating around the world origin flung the arms behind the camera (one wasted round).
- Set absolute render paths (`bpy.ops.render.render` with a relative path wrote nothing); `ONLY=20,36 python3 pov.py` renders check frames.
- Reset every bone to identity each frame before posing, or poses accumulate.
- Portrait camera: sensor fit uses the longer side; pitch the camera down ~12 degrees or the hands stay out of frame.
- v1 is a blockout look: fire as sphere swarm, anime VRM, the second VRM stays in a T-pose (arm rotation axis for a turned-around armature not solved). Not the real-life look; that needs a video model or a realistic base.
