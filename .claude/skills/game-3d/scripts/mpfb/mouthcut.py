"""mouthcut.py fig.blend LODI: on a far LOD, find the faces near the mouth whose texture is strongly red (lip or mouth cavity) and
collapse their red corners onto the nearest non-red neighbour vertex position average (merge into skin), so no red bar is left."""
import bpy, bmesh, sys, os, numpy as np
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and '_LOD' in o.name], key=lambda o: o.name); o = lods[int(a[1])]
img = next(i for i in bpy.data.images if i.name.endswith('_color.png'))
if not img.has_data or img.size[0] == 0: img.filepath = os.path.join(os.path.dirname(os.path.abspath(a[0])), img.name); img.reload()
W, H = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
def tex(u): return px[min(H - 1, max(0, int(u.y * H))), min(W - 1, max(0, int(u.x * W)))]
bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active
hz = max(v.co.z for v in bm.verts) - 0.17
redv = set()
for f in bm.faces:
    for l in f.loops:
        c = tex(l[uvl].uv)
        if l.vert.co.z > hz - 0.06 and l.vert.co.z < hz + 0.02 and l.vert.normal.y < 0.2 and c[0] > c[1] * float(os.environ.get('RR', 1.55)): redv.add(l.vert)
print('red verts', len(redv), 'mouth z', round(hz, 3))
# give every red corner the UV of the nearest non-red corner on the same face (no flat patch: the skin gradient carries on)
n = 0
for f in bm.faces:
    ls = [l for l in f.loops if l.vert in redv]
    ok = [l for l in f.loops if l.vert not in redv]
    if not ls: continue
    if not ok: continue
    for l in ls:
        b = min(ok, key=lambda k: (k.vert.co - l.vert.co).length); l[uvl].uv = b[uvl].uv.copy(); n += 1
m = 0  # faces that were red at every corner: each corner takes the UV its vertex now has on a neighbouring face
for f in bm.faces:
    if all(l.vert in redv for l in f.loops) and all(tex(l[uvl].uv)[0] > tex(l[uvl].uv)[1] * float(os.environ.get('RR', 1.55)) for l in f.loops):
        for l in f.loops:
            alt = [k for k in l.vert.link_loops if k.face is not f and not (tex(k[uvl].uv)[0] > tex(k[uvl].uv)[1] * float(os.environ.get('RR', 1.55)))]
            if alt: l[uvl].uv = alt[0][uvl].uv.copy(); m += 1
print('corners moved', n, 'full-red corners', m)
bm.to_mesh(o.data); bm.free(); bpy.ops.wm.save_mainfile()
