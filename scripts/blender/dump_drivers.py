"""dump_drivers.py: every driver in the open .blend as JSON for `node scripts/pipeline-gates.mjs drivers <out.json>`.
Run headless with the file open: --factory-startup -P scripts/blender/dump_drivers.py -- <out.json>
Covers objects, their shape keys, materials and node trees; one row per driver F-curve with its variables and whether each target resolves."""
import bpy, sys, json

out = sys.argv[sys.argv.index('--') + 1]
rows = []


def owners():
    for o in bpy.data.objects:
        yield o.name, o
        if o.type == 'MESH' and o.data.shape_keys: yield f'{o.name}:keys', o.data.shape_keys
    for m in bpy.data.materials:
        yield f'mat:{m.name}', m
        if m.node_tree: yield f'mat:{m.name}:nodes', m.node_tree


for name, idb in owners():
    ad = getattr(idb, 'animation_data', None)
    if not ad: continue
    for fc in ad.drivers:
        d = fc.driver; vs = []
        for v in d.variables:
            ts = []
            for t in v.targets:
                ok = False
                if t.id is not None and v.type == 'SINGLE_PROP' and t.data_path:
                    try: t.id.path_resolve(t.data_path); ok = True
                    except Exception: ok = False
                elif v.type == 'CONTEXT_PROP':   # reads the scene or view layer, has no id
                    ok = True
                elif t.id is not None and v.type != 'SINGLE_PROP':   # transform, rotation and distance variables: id plus an optional bone
                    ok = not t.bone_target or (getattr(t.id, 'pose', None) is not None and t.bone_target in t.id.pose.bones)
                ts.append({'id': t.id.name if t.id else None, 'data_path': t.data_path, 'bone_target': t.bone_target,
                           'transform_type': getattr(t, 'transform_type', None), 'resolved': ok})
            vs.append({'name': v.name, 'type': v.type, 'targets': ts})
        rows.append({'owner': name, 'path': fc.data_path, 'type': d.type, 'expression': d.expression, 'variables': vs})
json.dump(rows, open(out, 'w'), indent=1)
print('DRIVERS', len(rows), '->', out)
