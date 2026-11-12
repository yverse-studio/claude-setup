"""progress_heartbeat.py: the writer side of the laptop-job heartbeat (docs/pc-claude-user.md, Long laptop jobs).
Add `-P scripts/blender/progress_heartbeat.py` before the render in the job command and `-- <progress file>` after it.
After every rendered frame the file is rewritten with {"frame", "done", "total", "ts"}; scripts/laptop-job.mjs kills the job
when the file goes stale. Resume = render again with Overwrite off: frames already on disk are skipped."""
import json, sys, time

try:
    import bpy
except ImportError:   # unit tests and linting without Blender
    bpy = None

_done = 0


def write_progress(path, frame, done, total, now=time.time):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'frame': frame, 'done': done, 'total': total, 'ts': now()}, f)


def install(path):
    scene = bpy.context.scene
    total = scene.frame_end - scene.frame_start + 1

    def on_frame(scn, *_):
        global _done
        _done += 1
        write_progress(path, scn.frame_current, _done, total)

    # No write before frame 1: laptop-job gives the first frame 30 min of grace, and a startup write would end that grace after 10.
    bpy.app.handlers.render_post.append(on_frame)


if bpy is not None and '--' in sys.argv:
    install(sys.argv[sys.argv.index('--') + 1])
