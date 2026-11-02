"""Scale migration (docs/base-delta.md, scale rule): turn an armature that carries object scale k (or sits under a scaled parent)
into scale 1 without changing the animation. For files that already exist with the violation (the live night scene: 0.9829 and 0.94).
  blender -b <scene>.blend --factory-startup -P migrate_scale.py -- <out.blend> [dry]
Per armature with world scale != 1 (must be uniform, else it stops and says so):
  1. samples the world position of every bone head on 5 frames (before),
  2. applies the scale to the armature, its scaled parents and everything parented below (meshes, empties),
  3. multiplies pose-bone LOCATION f-curves of the actions this armature plays (active action and NLA strips) by k (rotation and scale curves stay), pose locations and
     Limit Distance / Limit Location constraint values likewise,
  4. samples again and fails when any bone is off by more than 0.5 mm.
The input file is never written; the output is a new file. Not scaled, listed as TODO: camera focus distance, cloth caches,
drivers or expressions with hand-typed lengths."""
import bpy, sys

args = sys.argv[sys.argv.index('--') + 1:]
OUT, DRY = args[0], 'dry' in args
TOL_MM = 0.5


def fcurves(a):
    try: return list(a.fcurves)
    except AttributeError: return [fc for l in a.layers for s in l.strips for cb in s.channelbags for fc in cb.fcurves]


def sample(arm, frames):
    out = {}
    for f in frames:
        bpy.context.scene.frame_set(f); bpy.context.view_layer.update()
        mw = arm.matrix_world
        out[f] = {b.name: (mw @ b.head).copy() for b in arm.pose.bones}
    return out


def run():
    sc = bpy.context.scene; f0, f1 = sc.frame_start, sc.frame_end
    frames = sorted({f0, f0 + (f1 - f0) // 4, (f0 + f1) // 2, f0 + 3 * (f1 - f0) // 4, f1})
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE' and abs(o.matrix_world.to_scale().x - 1) > 1e-4]
    if not arms:
        print('MIGRATE nothing to do: all armatures have world scale 1'); return
    report = []
    for arm in arms:
        s = arm.matrix_world.to_scale()
        if abs(s.x - s.y) > 1e-4 or abs(s.y - s.z) > 1e-4:
            raise SystemExit(f'{arm.name}: scale {tuple(s)} is not uniform; fix by hand')
        report.append((arm, s.x, sample(arm, frames)))
        print('PLAN', arm.name, 'world scale', round(s.x, 5), 'own', tuple(round(x, 5) for x in arm.scale),
              'parent', arm.parent.name if arm.parent else None, 'children', [c.name for c in arm.children][:8])
    if DRY: return
    vl = bpy.context.view_layer
    done_roots = set()
    for arm, k, before in report:
        root = arm
        while root.parent and abs(root.parent.matrix_world.to_scale().x - 1) > 1e-4: root = root.parent
        if root.name in done_roots: continue
        done_roots.add(root.name)
        group = [root] + list(root.children_recursive)
        for o in vl.objects: o.select_set(False)
        for o in group:
            o.hide_set(False); o.hide_viewport = False; o.select_set(True)
        vl.objects.active = root
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True, properties=True)
    n = 0
    seen = set()
    for arm, k, before in report:
        ad = arm.animation_data
        mine = ([ad.action] if ad and ad.action else []) + ([st.action for t in ad.nla_tracks for st in t.strips if st.action] if ad else [])
        for a in mine:
            for i, fc in enumerate(fcurves(a)):
                if (a.name, i) in seen or not (fc.data_path.startswith('pose.bones') and fc.data_path.endswith('.location')): continue
                seen.add((a.name, i))
                for kp in fc.keyframe_points:
                    kp.co.y *= k; kp.handle_left.y *= k; kp.handle_right.y *= k; n += 1
        for pb in arm.pose.bones:
            pb.location = pb.location * k
            for c in pb.constraints:
                if c.type == 'LIMIT_DISTANCE': c.distance *= k
                if c.type == 'LIMIT_LOCATION':
                    for ax in 'xyz':
                        setattr(c, 'min_' + ax, getattr(c, 'min_' + ax) * k); setattr(c, 'max_' + ax, getattr(c, 'max_' + ax) * k)
        print('APPLIED', arm.name, 'k', round(k, 5), 'location keys scaled so far', n)
    worst = 0.0
    for arm, k, before in report:
        after = sample(arm, frames)
        for f in frames:
            for b, p in before[f].items():
                worst = max(worst, (after[f][b] - p).length * 1000)
        print('CHECK', arm.name, 'worst bone shift over', len(frames), 'frames: %.3f mm' % worst)
    sc.frame_set(f0)
    print('TODO camera focus distance, cloth caches, hand-set drivers or expressions with lengths: check by eye')
    if worst > TOL_MM:
        raise SystemExit(f'FAIL: bones moved {worst:.2f} mm (limit {TOL_MM}); not saved')
    bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
    print('SAVED', OUT)


run()
