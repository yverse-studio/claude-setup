"""Verify task of cxy-scene-final: GREEN only if every cam x frame PNG exists with size > 0,
the DONE marker exists and says ok, and at least one frame was rendered in this run (skip-existing trap).
Exit 0 = green, 1 = red. Writes <out>/_cxy/<f0>-<f1>.verify.json.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cxy_common import expected_cams, frame_path, marker_path  # noqa: E402


def check(out, cams_json, key, f0, f1, only=''):
    problems = []
    try:
        cams = expected_cams(cams_json, key, only)
    except (OSError, KeyError, ValueError) as e:
        return dict(ok=False, problems=[f'cams.json unreadable: {e!r}'])
    if not cams:
        problems.append('no cams selected')
    frames = range(f0, f1 + 1)
    missing = [frame_path(out, c, f) for c in cams for f in frames if not os.path.exists(frame_path(out, c, f))]
    empty = [frame_path(out, c, f) for c in cams for f in frames
             if os.path.exists(frame_path(out, c, f)) and os.path.getsize(frame_path(out, c, f)) == 0]
    if missing:
        problems.append(f'{len(missing)} PNG missing, first {missing[0]}')
    if empty:
        problems.append(f'{len(empty)} PNG with 0 bytes, first {empty[0]}')
    mp, marker = marker_path(out, f0, f1), None
    if not os.path.exists(mp):
        problems.append(f'DONE marker missing: {mp}')
    else:
        with open(mp, encoding='utf-8') as fh:
            marker = json.load(fh)
        if not marker.get('ok'):
            problems.append('DONE marker not ok')
        if int(marker.get('rendered_new', 0)) == 0:
            problems.append('rendered 0 frames this run (existing PNGs skipped; resubmit with overwrite)')
        elif not marker.get('overwrite') and int(marker.get('rendered_new', 0)) < len(cams) * len(frames):
            problems.append(f"only {marker.get('rendered_new')} of {len(cams) * len(frames)} frames rendered now, the rest are old PNGs (overwrite off)")
    expected = len(cams) * len(frames)
    return dict(ok=not problems, expected=expected, found=expected - len(missing),
                rendered_new=(marker or {}).get('rendered_new'), problems=problems)


def main():
    ap = argparse.ArgumentParser()
    for k in ('out', 'cams', 'key'):
        ap.add_argument(f'--{k}', required=True)
    ap.add_argument('--f0', type=int, required=True)
    ap.add_argument('--f1', type=int, required=True)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    res = check(a.out, a.cams, a.key, a.f0, a.f1, a.only)
    os.makedirs(os.path.dirname(marker_path(a.out, a.f0, a.f1)), exist_ok=True)
    with open(marker_path(a.out, a.f0, a.f1).replace('.json', '.verify.json'), 'w', encoding='utf-8') as fh:
        json.dump(res, fh, indent=1)
    print(('VERIFY GREEN ' if res['ok'] else 'VERIFY RED ') + json.dumps(res), flush=True)
    sys.exit(0 if res['ok'] else 1)


if __name__ == '__main__':
    main()
