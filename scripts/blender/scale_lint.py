"""Scale lint (docs/base-delta.md, scale rule): every armature and every mesh has object scale 1, and so does every parent above it.
  blender -b --factory-startup -P scale_lint.py -- <out.json> <a.blend> [<b.blend> ...]     (opens the files one after another, writes nothing)
Reports per file: objects with own or world scale != 1 (armatures, meshes, and empties that parent them) with their parent chain.
The JSON has everything; the SCALE lines say OK or FAIL per file."""
import bpy, sys, json, os

args = sys.argv[sys.argv.index('--') + 1:]
out, files = args[0], args[1:]
TOL = 1e-4


def lint(path):
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
    bad = []
    for o in bpy.data.objects:
        if o.type not in ('ARMATURE', 'MESH', 'EMPTY'): continue
        own = tuple(round(x, 5) for x in o.scale)
        world = tuple(round(x, 5) for x in o.matrix_world.to_scale())
        if any(abs(x - 1) > TOL for x in own) or any(abs(x - 1) > TOL for x in world):
            if o.type == 'EMPTY' and not any(c.type in ('ARMATURE', 'MESH') for c in o.children_recursive): continue
            chain, p = [], o.parent
            while p:
                chain.append((p.name, tuple(round(x, 5) for x in p.scale))); p = p.parent
            bad.append(dict(object=o.name, type=o.type, scale=own, world_scale=world, parents=chain,
                            collections=[c.name for c in o.users_collection], children=len(o.children_recursive)))
    return dict(file=path, armatures=[o.name for o in bpy.data.objects if o.type == 'ARMATURE'], offenders=bad, ok=not bad)


res = []
for f in files:
    try: res.append(lint(f))
    except Exception as e: res.append(dict(file=f, error=str(e), ok=False))
json.dump(res, open(out, 'w'), indent=1)
for r in res:
    print('SCALE', 'OK  ' if r['ok'] else 'FAIL', os.path.basename(r['file']), [(b['object'], b['scale'], b['world_scale']) for b in r.get('offenders', [])][:6], r.get('error', ''))
