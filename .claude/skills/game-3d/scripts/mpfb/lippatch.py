"""lippatch.py fig.blend LODI [px]: far-LOD lips read as a hard red triangle because one big face samples the saturated lip texels.
Paint a small soft patch (muted rose centre fading to skin at the edge) into an unused corner of the shared atlas and map the
red mouth faces of that LOD into it, keeping their layout: the far mouth gets a soft, muted lip; no other LOD changes."""
import bpy, bmesh, sys, os, numpy as np
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
bpy.ops.wm.open_mainfile(filepath=a[0]); B = int(a[2]) if len(a) > 2 else 32
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and '_LOD' in o.name], key=lambda o: o.name); o = lods[int(a[1])]
img = next(i for i in bpy.data.images if i.name.endswith('_color.png'))
if not img.has_data or img.size[0] == 0: img.filepath = os.path.join(os.path.dirname(os.path.abspath(a[0])), img.name); img.reload()
W, H = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
def tex(u): return px[min(H - 1, max(0, int(u.y * H))), min(W - 1, max(0, int(u.x * W)))]
used = np.zeros((H, W), bool)  # every texel any LOD's face box touches
for ob in lods:
    uv = ob.data.uv_layers.active.data
    for p in ob.data.polygons:
        us = np.array([uv[i].uv[:] for i in p.loop_indices]); x0, y0 = np.floor(us.min(0) * [W, H]).astype(int) - 2; x1, y1 = np.ceil(us.max(0) * [W, H]).astype(int) + 2
        used[max(y0, 0):min(y1, H), max(x0, 0):min(x1, W)] = True
spot = None; M = B // 2  # a skin margin round the block, so mip levels (KTX2) do not blend in empty texels and pale the lip
for y in range(0, H - B - 2 * M, 4):
    for x in range(0, W - B - 2 * M, 4):
        if not used[y:y + B + 2 * M, x:x + B + 2 * M].any(): spot = (x + M, y + M); break
    if spot: break
assert spot, 'no free block in the atlas'
bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active
hz = max(v.co.z for v in bm.verts) - 0.17
RR = float(os.environ.get('RR', 1.5))
def red(l): c = tex(l[uvl].uv); return c[0] > c[1] * RR
core = [f for f in bm.faces if hz - 0.08 < f.calc_center_median().z < hz + 0.03 and abs(f.calc_center_median().x) < 0.035
        and f.normal.y < float(os.environ.get('NY', -0.2)) and all(tex(l[uvl].uv)[0] > tex(l[uvl].uv)[1] * float(os.environ.get('CORE', 1.8)) for l in f.loops)]  # the visible lip faces (front, mostly red)
mouth = list({g for f in core for e in f.edges for g in e.link_faces if g.normal.y < -0.2} | set(core))  # plus their front neighbours
lip = np.median([tex(l[uvl].uv)[:3] for f in mouth for l in f.loops if red(l)], axis=0)
skin = np.median([tex(l[uvl].uv)[:3] for f in bm.faces if 0.02 < abs(f.calc_center_median().x) < 0.05 and hz - 0.06 < f.calc_center_median().z < hz + 0.04 for l in f.loops if not red(l)], axis=0)
LW = float(os.environ.get('LIPW', 0.55)); rose = skin * (1 - LW) + lip * LW
x, y = spot; px[y - M:y + B + M, x - M:x + B + M, :3] = skin; px[y - M:y + B + M, x - M:x + B + M, 3] = 1; yy, xx = np.mgrid[0:B, 0:B]; d = np.hypot((xx - B / 2 + .5) / (B / 2), (yy - B / 2 + .5) / (B / 4))  # wide, flat ellipse
t = np.clip(1 - d, 0, 1); t = t * t * (3 - 2 * t)
px[y:y + B, x:x + B, :3] = skin * (1 - t[..., None]) + rose * t[..., None]; px[y:y + B, x:x + B, 3] = 1
# the mouth faces' own 3D layout (x across, z up) mapped into the block: lip centre at the block centre
vs = {l.vert for f in core for l in f.loops}; xs = [v.co.x for v in vs]; zs = [v.co.z for v in vs]
cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2; sx = max(max(xs) - min(xs), 1e-3) / 2 * float(os.environ.get('SPREAD', 2.2)); sz = max(max(zs) - min(zs), 1e-3) / 2 * float(os.environ.get('SPREAD', 2.2))
for f in mouth:
    for l in f.loops:
        cu = min(max((l.vert.co.x - cx) / sx, -1), 1); cv = min(max((l.vert.co.z - cz) / sz, -1), 1)  # outside the lip: the skin rim
        l[uvl].uv = ((x + B / 2 + cu * (B / 2 - 1)) / W, (y + B / 2 + cv * (B / 2 - 1)) / H)
bm.to_mesh(o.data); bm.free(); img.pixels[:] = px.ravel().tolist(); img.save(); bpy.ops.wm.save_mainfile()
print('LIPPATCH core', len(core), 'faces', len(mouth), 'block', spot, 'lip', np.round(lip, 2), 'skin', np.round(skin, 2))
