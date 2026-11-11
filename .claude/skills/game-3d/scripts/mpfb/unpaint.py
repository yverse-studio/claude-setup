"""unpaint.py fig.blend ref.blend: body faces on the near LOD whose UVs were collapsed to one texel by `scalp` and that no hair
covers get their skin UVs back from the reference LOD (ref.blend, same build before fix_faces) by nearest-surface interpolation."""
import bpy, bmesh, sys
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
o = sorted([x for x in bpy.data.objects if x.type == 'MESH' and '_LOD' in x.name], key=lambda x: x.name)[0]
with bpy.data.libraries.load(a[1]) as (src, dst): dst.objects = [n for n in src.objects if n.endswith('_LOD2')]
ref = dst.objects[0]; rm = ref.data
rb = bmesh.new(); rb.from_mesh(rm); rb.faces.ensure_lookup_table(); ruv = rb.loops.layers.uv.active
risl = {}; rc = 0  # only the reference's skin: brow and lash cards near the forehead would hand out their UVs
for f0 in rb.faces:
    if f0.index in risl: continue
    st = [f0]; risl[f0.index] = rc
    while st:
        x = st.pop()
        for e in x.edges:
            for y in e.link_faces:
                if y.index not in risl: risl[y.index] = rc; st.append(y)
    rc += 1
from collections import Counter as _C
rbody = _C(risl.values()).most_common(1)[0][0]; rfaces = [f0 for f0 in rb.faces if risl[f0.index] == rbody]
rt = BVHTree.FromPolygons([v.co for v in rb.verts], [[v.index for v in f0.verts] for f0 in rfaces])
bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table(); uv = bm.loops.layers.uv.active
# islands: the body is the biggest; hair = islands reaching above the brow
from collections import Counter
isl = {}; cur = 0
for v in bm.verts:
    if v.index in isl: continue
    st = [v]; isl[v.index] = cur
    while st:
        x = st.pop()
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in isl: isl[y.index] = cur; st.append(y)
    cur += 1
cnt = Counter(isl.values()); body = max(cnt, key=cnt.get)
top = max(v.co.z for v in bm.verts)
hair = [f for f in bm.faces if isl[f.verts[0].index] != body and max(v.co.z for v in f.verts) > top - 0.06 and cnt[isl[f.verts[0].index]] > 300]
ht = BVHTree.FromPolygons([v.co for v in bm.verts], [[v.index for v in f.verts] for f in hair])
n = 0
for f in bm.faces:
    if isl[f.verts[0].index] != body: continue
    us = [tuple(l[uv].uv) for l in f.loops]
    if max(abs(u[0] - us[0][0]) + abs(u[1] - us[0][1]) for u in us) > 1e-6: continue  # not painted
    if all(ht.ray_cast(v.co + v.normal * 0.001, v.normal, 0.03)[0] is not None for v in f.verts): continue  # really under the hair
    for l in f.loops:
        loc, nr, i, d = rt.find_nearest(l.vert.co); rf = rfaces[i]
        tri = [lv.vert.co for lv in rf.loops[:3]]; tu = [lv[ruv].uv.to_3d() for lv in rf.loops[:3]]
        l[uv].uv = barycentric_transform(loc, *tri, *tu).to_2d()
    n += 1
bm.to_mesh(o.data); bm.free(); print('UNPAINT faces', n, 'hair faces', len(hair))
bpy.ops.wm.save_mainfile()
