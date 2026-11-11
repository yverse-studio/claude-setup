"""The one resolver for laptop paths in Python (3D and cxy scripts). The root is the env var STUDIO_ROOT, the folder names
live in config/paths.json. Nothing else in this repo may write a drive path (scripts/paths-lint.test.mjs).
Not set = stop: there is no default root to fall back to.

  import paths; paths.path('characters', 'CH_rika')   ->  <STUDIO_ROOT>/lib/characters/CH_rika
"""
import json
import os

_TABLE = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'config', 'paths.json'), encoding='utf-8'))


def dead_names():
    return list(_TABLE['dead_names'])


def studio_root():
    root = os.environ.get('STUDIO_ROOT')
    if not root:
        raise SystemExit('set STUDIO_ROOT (the root folder of the studio, see docs/laptop-folders.md)')
    return root


def path(name, *rest):
    rel = _TABLE['names'].get(name)
    if rel is None:
        raise SystemExit(f'unknown path name "{name}" (config/paths.json)')
    return os.path.join(studio_root(), *rel.split('/'), *rest)


def blender_exe():
    """The Blender binary named in <STUDIO_ROOT>/tools/BLENDER_EXE.txt (first line)."""
    f = path('blender_exe_file')
    if not os.path.isfile(f):
        raise SystemExit(f'{f} missing: put the path of blender.exe in it')
    return open(f, encoding='utf-8').read().strip().splitlines()[0].strip()
