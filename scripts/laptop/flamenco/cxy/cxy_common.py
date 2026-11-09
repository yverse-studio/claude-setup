"""Shared helpers for the cxy-scene-final Flamenco job type (gate, render wrapper, verify, submit)."""
import json
import os

MARKER_DIR = '_cxy'


def expected_cams(cams_json, key='-', only=''):
    """Cam names the renderer will write, same rule as final_render_a14.py (list, or data[key]['cams'], filtered by only)."""
    with open(cams_json, encoding='utf-8') as fh:
        data = json.load(fh)
    cams = data if isinstance(data, list) else data[key]['cams']
    names = [c['name'] for c in cams]
    if only:
        wanted = [x for x in only.split(',') if x]
        names = [n for n in names if n in wanted]
    return names


def frame_path(out, cam, frame):
    return os.path.join(out, cam, f'{frame:03d}.png')


def marker_path(out, f0, f1):
    return os.path.join(out, MARKER_DIR, f'{f0}-{f1}.json')


def parse_opts(items):
    """k=v pairs after the five positional args, like final_render_a14.py."""
    return dict(x.split('=', 1) for x in items if '=' in x)


def parse_env(text):
    """'K=V|K2=V2' -> {'K': 'V', 'K2': 'V2'}."""
    pairs = [p.split('=', 1) for p in (text or '').split('|') if '=' in p]
    return {k.strip(): v.strip() for k, v in pairs if k.strip()}
