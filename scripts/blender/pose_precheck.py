"""Pre-bake check for known repeat pose bugs (animator.md, Fast loop). Run before any bake:
  blender -b scene.blend --python scripts/blender/pose_precheck.py -- --config precheck.json [--frames 1,40,80] [--out precheck.json.out]
Checks, per frame, on the evaluated pose:
  1. arms behind the back: a hand bone head lies behind the torso plane by more than `behind_mm`
     and within the body width (the arms-crossed-behind-the-back bug).
  2. fingers in skin: a finger-tip point lies inside a target mesh by more than `inside_mm`
     (signed, BVH nearest point + normal sign; unsigned distance counts a hand 50 mm inside as touching).
Config (JSON): {"armature": "Rig", "torso": "spine", "forward": [0,-1,0], "width_mm": 250,
  "hands": ["hand.L","hand.R"], "tips": ["index_tip.L", ...], "skin": ["BodyMesh","ManMesh"],
  "behind_mm": 40, "inside_mm": 2, "forward_space": "torso"}
`forward_space` "torso" (recommended) reads `forward` in the armature's rest space and carries it through
the posed torso bone, so an object yaw, a root-bone turn or a bent spine moves the torso plane with the
figure; "world" (default, old behaviour) takes `forward` as a fixed world axis and is wrong for any figure
turned away from it (a scene yaw of 180 turns every hand in front into "behind the back").
Exit 1 and one line per failure when anything is over; exit 0 prints one OK line. Bone and mesh
names come from the scene's bone alias table, never hard-coded here."""
import bpy, bmesh, json, sys
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opt = {argv[i]: argv[i + 1] for i in range(0, len(argv) - 1, 2)}
cfg = json.load(open(opt["--config"]))
sc = bpy.context.scene
frames = [int(f) for f in opt["--frames"].split(",")] if "--frames" in opt else list(range(sc.frame_start, sc.frame_end + 1, 4)) + [sc.frame_end]
arm = bpy.data.objects[cfg["armature"]]
fwd_cfg = Vector(cfg["forward"]).normalized()
space = cfg.get("forward_space", "world")
behind, inside = cfg.get("behind_mm", 40) / 1000, cfg.get("inside_mm", 2) / 1000
width = cfg.get("width_mm", 250) / 1000
fails = []

def tree(obj, dg):
    ev = obj.evaluated_get(dg)
    bm = bmesh.new(); bm.from_mesh(ev.to_mesh()); bm.transform(obj.matrix_world)
    t = BVHTree.FromBMesh(bm); bm.free(); ev.to_mesh_clear(); return t

for f in frames:
    sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
    ae = arm.evaluated_get(dg)
    pb = ae.pose.bones[cfg["torso"]]
    tp = ae.matrix_world @ pb.head
    rot = Matrix.Identity(3) if space == "world" else (ae.matrix_world @ pb.matrix).to_3x3().normalized() @ pb.bone.matrix_local.to_3x3().normalized().inverted()
    fwd, up = (rot @ fwd_cfg).normalized(), (rot @ Vector((0, 0, 1))).normalized()
    side = fwd.cross(up)
    for h in cfg["hands"]:
        d = ae.matrix_world @ ae.pose.bones[h].head - tp
        if d.dot(fwd) < -behind and abs(d.dot(side)) < width:
            fails.append(f"f{f} {h}: {abs(d.dot(fwd)) * 1000:.0f} mm behind the torso plane (arm crossed behind the back)")
    trees = [(n, tree(bpy.data.objects[n], dg)) for n in cfg["skin"]]
    for t in cfg["tips"]:
        p = ae.matrix_world @ ae.pose.bones[t].tail
        for n, bt in trees:
            loc, nor, _i, dist = bt.find_nearest(p)
            if loc is not None and (p - loc).dot(nor) < 0 and dist > inside:
                fails.append(f"f{f} {t} in {n}: {dist * 1000:.1f} mm inside")
if "--out" in opt: json.dump(fails, open(opt["--out"], "w"), indent=1)
print("\n".join(fails) if fails else f"pose_precheck OK: {len(frames)} frames, no arm behind the back, no tip in skin")
sys.exit(1 if fails else 0)
