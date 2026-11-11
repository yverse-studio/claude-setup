"""sliver.py fig.blend LODI: on a far LOD, body-island face-skin faces (front, between chin and brow) whose corners sample dark hair
texels show as a dark sliver where the cheek meets the hair. Each dark corner takes the UV of the nearest skin corner on its face;
faces dark at every corner take the UV their vertex has on a skin face next to it."""
import bpy, bmesh, sys, os, numpy as np
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and '_LOD' in o.name], key=lambda o: o.name); o = lods[int(a[1])]
img = next(i for i in bpy.data.images if i.name.endswith('_color.png'))
if not img.has_data or img.size[0] == 0: img.filepath = os.path.join(os.path.dirname(os.path.abspath(a[0])), img.name); img.reload()
W, H = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
def tex(u): return px[min(H - 1, max(0, int(u.y * H))), min(W - 1, max(0, int(u.x * W)))]
bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active; bm.verts.ensure_lookup_table()
seen = set(); parts = []
for v in bm.verts:
    if v in seen: continue
    st = [v]; comp = []; seen.add(v)
    while st:
        x = st.pop(); comp.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y not in seen: seen.add(y); st.append(y)
    parts.append(comp)
body = set(max(parts, key=len)); top = max(v.co.z for v in bm.verts)
DK = float(os.environ.get('DARK', 0.3))
def dark(l): return tex(l[uvl].uv)[:3].mean() < DK
zone = [f for f in bm.faces if f.verts[0] in body and top - 0.24 < f.calc_center_median().z < top - 0.09 and f.normal.y < 0.1
        and abs(f.calc_center_median().x) < 0.085]
n = m = 0
for f in zone:
    ok = [l for l in f.loops if not dark(l)]
    if not ok: continue
    for l in f.loops:
        if dark(l): l[uvl].uv = min(ok, key=lambda k: (k.vert.co - l.vert.co).length)[uvl].uv.copy(); n += 1
for f in zone:
    if all(dark(l) for l in f.loops):
        for l in f.loops:
            alt = [k for k in l.vert.link_loops if k.face is not f and not dark(k)]
            if alt: l[uvl].uv = alt[0][uvl].uv.copy(); m += 1
print('SLIVER zone', len(zone), 'corners', n, 'full-dark corners', m)
bm.to_mesh(o.data); bm.free(); bpy.ops.wm.save_mainfile()
