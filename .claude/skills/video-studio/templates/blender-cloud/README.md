# Blender in the cloud (headless `bpy`), starter

Rule and the estimate live in the `studio` skill (Where Blender runs). This folder is the proven
starter: a 16 s vertical test reel, built and rendered completely in the cloud on 2026-11-03
(first run by yskills; source files in the `lib/` thing they belong to, on the laptop).

## Run

```bash
pip install bpy numpy                      # Blender 5.2 as a Python module, no GPU, 4 cores
mkdir -p frames
python3 -I scene.py -- 540 960 12 frames/f_ 1 385 --save room.blend   # W H SAMPLES OUTPREFIX FIRST LAST
python3 -I sound.py sound.wav                                         # numpy only, 16 s retro sound
ffmpeg -framerate 24 -i frames/f_%04d.png -i sound.wav -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -shortest out.mp4
```

Test a few frames first (`FIRST LAST` = `97 97`), then the whole range. Scene: calm room, bursts
apart at 4 s, floats, reassembles by 13 s, camera pushes in. Blockout boxes only: pipeline proof,
not a look (critic: flat light, no detail, weak end payoff; v2 needs textures, RGB light, a payoff).

## Measured (yskills, 2026-11-03, 4 CPU cores, no GPU)

| Step | Time |
|---|---|
| Cycles, CPU, 540x960, 24 fps, 12 samples + denoise, AgX | about 13 s per frame; 385 frames = 1 h 23 min |
| Setup and test frames | about 10 min |
| Sound, text overlay, mp4 | about 2 min |

Eevee and GPU: faster, but not measured yet and not proven headless in the container (needs GL;
software GL may be slow). Measure one frame before trusting it, then add the number here.

Older cloud example with a VRM character and a POV camera: [`../blender-pov/`](../blender-pov/README.md).
