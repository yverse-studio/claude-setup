"""Blender --python last step of cxy-scene-final: runs the real renderer and writes the DONE marker.

Args after '--' are the renderer's own: <cams.json> <key> <f0> <f1> <out> k=v...
Extra keys read here: render_script=<path> (required), overwrite=1 (move existing PNGs of the range aside first).
Marker <out>/_cxy/<f0>-<f1>.json: {ok, start, end, rendered_new, log}. cxy_verify.py fails without it.
"""
import json
import os
import runpy
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cxy_common import expected_cams, frame_path, marker_path, parse_opts  # noqa: E402


def move_aside(out, cams, frames, stamp):
    """overwrite=1: existing PNGs go to <out>/_replaced/<stamp>/<cam>/, never deleted."""
    moved = 0
    for cam in cams:
        for f in frames:
            src = frame_path(out, cam, f)
            if os.path.exists(src):
                dst = os.path.join(out, '_replaced', stamp, cam)
                os.makedirs(dst, exist_ok=True)
                shutil.move(src, os.path.join(dst, os.path.basename(src)))
                moved += 1
    return moved


def count_new(out, cams, frames, since):
    return sum(1 for c in cams for f in frames
               if os.path.exists(frame_path(out, c, f)) and os.path.getmtime(frame_path(out, c, f)) >= since)


def main():
    a = sys.argv[sys.argv.index('--') + 1:]
    cams_json, key, f0, f1, out = a[0], a[1], int(a[2]), int(a[3]), a[4]
    opt = parse_opts(a[5:])
    script = opt.get('render_script')
    if not script or not os.path.exists(script):
        raise SystemExit(f'CXY_FAIL render_script missing: {script}')
    cams, frames = expected_cams(cams_json, key, opt.get('only', '')), list(range(f0, f1 + 1))
    marker = marker_path(out, f0, f1)
    if os.path.exists(marker):
        os.remove(marker)
    stamp = time.strftime('%Y%m%d-%H%M%S')
    if opt.get('overwrite') == '1':
        print('CXY_OVERWRITE moved aside', move_aside(out, cams, frames, stamp), flush=True)
    start = time.time() - 1  # mtime granularity
    g = runpy.run_path(script, run_name='__main__')
    rec = dict(ok=True, start=start, end=time.time(), rendered_new=count_new(out, cams, frames, start),
               expected=len(cams) * len(frames), cams=cams, log=g.get('log'))
    os.makedirs(os.path.dirname(marker), exist_ok=True)
    with open(marker, 'w', encoding='utf-8') as fh:
        json.dump(rec, fh, indent=1, default=str)
    print('CXY_DONE', json.dumps({k: rec[k] for k in ('rendered_new', 'expected')}), flush=True)


if __name__ == '__main__':  # Blender's --python runs scripts as __main__
    main()
