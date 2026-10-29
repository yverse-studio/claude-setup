"""Topology break (a future base v5): carry a character's per-vertex own morph from the old base to the new one (docs/base-delta.md).
  blender -b <new_base>.blend --factory-startup -P delta_migrate.py -- <old_base.blend> <character.blend> <char> <out.npz> [role=body] [k=1.04236]
Own morph = the character's rest shape minus (old base basis x k), per vertex of the OLD mesh. Each vertex of the NEW base mesh takes the
displacement of the nearest point on the old surface, blended barycentrically over that triangle. Writes <role>|morph (new vertex count x 3)
and prints the fit: largest distance to the old surface (how far the two bases disagree) and the round-trip error on the old mesh.
The result is read by `delta.py sync` when the delta names it (`own_morph`: path, key `CH_<char>_own`, value 1). The base file is only read.
Bones carry over by name, key values by name: nothing else needs migrating."""
import bpy, sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
OLD, CHAR, NAME, OUT = args[:4]
ROLE = next((a[5:] for a in args[4:] if a.startswith('role=')), 'body')
K = next((float(a[2:]) for a in args[4:] if a.startswith('k=')), None)   # the character's proportion scale from its delta


def rest(o, k_ident=None):
    me = o.data; n = len(me.vertices)
    ck = me.shape_keys.key_blocks if me.shape_keys else None
    def a(d):
        x = np.empty(n * 3, np.float32); d.foreach_get('co', x); return x.reshape(-1, 3)
    basis = a(ck[0].data) if ck else a(me.vertices)
    ident = ck.get(k_ident) if ck and k_ident else None
    return basis + (a(ident.data) - basis) * ident.value if ident else basis


def find(prefix_list, suffix):
    return next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith(suffix) and o.name not in prefix_list)


def load(path, wanted):
    before = {o.name for o in bpy.data.objects}
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.endswith(wanted)]
    return [o for o in dst.objects if o]


suffix = '_Body' if ROLE == 'body' else ('Face' if ROLE == 'face' else '_Hair_' + ROLE.split(':')[1])
new_obj = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith(suffix) and '_Cos_' not in o.name)
new_basis = rest(new_obj)
old_base = load(OLD, suffix)[0]; char = load(CHAR, suffix)
char_obj = next(o for o in char if '_Cos_' not in o.name and 'FitBody' not in o.name)
k_arm = 1.0
ident = 'CH_' + NAME
old_basis, char_rest = rest(old_base), rest(char_obj, ident)
assert len(old_basis) == len(char_rest), 'character and old base must share a topology'
# the character's proportion: ratio of rest to old basis on the vertical extent
k = K if K else float(np.ptp(char_rest[:, 2]) / np.ptp(old_basis[:, 2]))
disp_old = char_rest - old_basis * k          # own morph on the old mesh
me = old_base.data; me.calc_loop_triangles()
tris = np.array([t.vertices[:] for t in me.loop_triangles], np.int32)
bvh = BVHTree.FromPolygons([Vector(v) for v in old_basis], [tuple(t) for t in tris])
out = np.zeros_like(new_basis); far = 0.0
for i, p in enumerate(new_basis):
    loc, nor, ti, dist = bvh.find_nearest(Vector(p))
    a, b, c = (Vector(old_basis[j]) for j in tris[ti])
    v0, v1, v2 = b - a, c - a, loc - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    w1 = (d11 * d20 - d01 * d21) / den if den else 0.0
    w2 = (d00 * d21 - d01 * d20) / den if den else 0.0
    w = np.array([1 - w1 - w2, w1, w2])
    out[i] = (disp_old[tris[ti]] * w[:, None]).sum(0); far = max(far, dist)
np.savez_compressed(OUT, **{f'{ROLE}|morph': out.astype(np.float32)})
print('MIGRATE', ROLE, 'k', round(k, 5), 'own morph max %.2f mm' % (np.abs(disp_old).max() * 1000), 'new verts', len(out),
      'farthest new vertex from old surface %.3f mm' % (far * 1000), 'SAVED', OUT)
