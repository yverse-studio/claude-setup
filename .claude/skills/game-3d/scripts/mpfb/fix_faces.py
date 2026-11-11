"""fix_faces.py file.blend op[,op...]: post-build face fixes on the near LOD (the far shells are baked from it).
ops: mouth (flat lip-coloured plate 8 mm behind the lips: no dark corner gap), hairline (paint skin in hairline notches with
the hair texture), smooth (relax the nostril-to-lip crease that decimation leaves). Saves the blend in place."""
import sys, os, bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
SRC, OPS = sys.argv[1], sys.argv[2].split(',')
bpy.ops.wm.open_mainfile(filepath=SRC)
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and '_LOD' in o.name], key=lambda o: o.name)
o = lods[int(os.environ.get('LODI', 0))]; me = o.data
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
# islands
isl = {}; cur = 0
for v in bm.verts:
    if v.index in isl: continue
    st = [v]; isl[v.index] = cur
    while st:
        a = st.pop()
        for e in a.link_edges:
            b = e.other_vert(a)
            if b.index not in isl: isl[b.index] = cur; st.append(b)
    cur += 1
cnt = {}
for i in isl.values(): cnt[i] = cnt.get(i, 0) + 1
body_i = max(cnt, key=cnt.get)
body_f = [f for f in bm.faces if isl[f.verts[0].index] == body_i]
bvh = BVHTree.FromPolygons([v.co for v in bm.verts], [[v.index for v in f.verts] for f in body_f])
top = max(v.co.z for v in bm.verts)
head = [v for v in bm.verts if isl[v.index] == body_i and v.co.z > top - 0.26]
nose = min((v for v in head if abs(v.co.x) < 0.012 and v.co.z < top - 0.06), key=lambda v: v.co.y)
nz = nose.co.z
prof = []
z = nz - 0.012
while z > nz - 0.045:
    h = bvh.ray_cast(Vector((0, -1, z)), Vector((0, 1, 0)))
    if h[0]: prof.append((z, h[0].y))
    z -= 0.0005
# the mouth gap is the deepest dip of the profile against its 1 cm neighbours
def dip(i):
    up = [y for zz, y in prof if 0.003 < zz - prof[i][0] < 0.012]
    dn = [y for zz, y in prof if 0.003 < prof[i][0] - zz < 0.012]
    return prof[i][1] - max(min(up), min(dn)) if up and dn else 0  # deeper than the lips above and below
mi = max(range(len(prof)), key=dip)
mz = prof[mi][0]
lipy = min(y for zz, y in prof if abs(zz - mz) < 0.012)
mc = Vector((0, lipy, mz))
print('nose z', round(nz, 3), 'mouth z', round(mz, 3), 'dip', round(dip(mi), 4), 'lip y', round(lipy, 3))

if 'mouth' in OPS:
    front = min((f for f in body_f if (f.calc_center_median() - mc).length < 0.02 and f.normal.y < -0.5),
                key=lambda f: (f.calc_center_median() - mc).length)
    lipuv = front.loops[0][uvl].uv.copy()
    cav = {v for v in head if abs(v.co.x) < 0.026 and abs(v.co.z - mz) < 0.013 and v.co.y > lipy + 0.008 and v.co.y < lipy + 0.06
           and v.normal.y > -0.2}
    rim = [v for v in head if v not in cav and abs(v.co.x) < 0.032 and abs(v.co.z - mz) < 0.014 and v.normal.y < -0.3]
    for v in cav:  # plate follows the lip curve: 6 mm behind the nearest lip front at this x, never moved forward
        fr = [r.co.y for r in rim if abs(r.co.x - v.co.x) < 0.005]
        if fr: v.co.y = max(min(v.co.y, min(fr) + 0.006), min(fr) + 0.003)
    nf = 0
    for f in body_f:
        if all(v in cav for v in f.verts):
            for l in f.loops: l[uvl].uv = lipuv
            nf += 1
    print('MOUTH plate verts', len(cav), 'faces re-uv', nf)

if 'hairline' in OPS:
    zs = {}
    for v in bm.verts: zs.setdefault(isl[v.index], []).append(v.co.z)
    hair = {i for i in cnt if i != body_i and max(zs[i]) > nz + 0.07}
    print('hair islands', [(i, cnt[i]) for i in hair], 'others', sorted(cnt.values())[-6:])
    hb = BVHTree.FromPolygons([v.co for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces if isl[f.verts[0].index] in hair])
    allb = BVHTree.FromPolygons([v.co for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces if isl[f.verts[0].index] in hair | {body_i}])
    # hairline seen from the front: per 4 mm column, the lowest z where a front ray still hits hair before skin
    B = 0.002; raw = {}
    for k in range(-20, 21):
        z = top
        while z > nz + 0.03:
            h = allb.ray_cast(Vector((k * B, -1, z)), Vector((0, 1, 0)))
            if h[0] is not None:
                hh = hb.ray_cast(Vector((k * B, -1, z)), Vector((0, 1, 0)))
                if hh[0] is None or hh[3] > h[3] + 1e-5: break
            z -= 0.0005
        raw[k] = z
    def side(k, sg): return min([raw[k + sg * d] for d in range(1, 7) if k + sg * d in raw] or [raw[k]])
    fill = {k: min(raw[k], max(side(k, 1), side(k, -1))) for k in raw}  # a notch: hair lower on both sides of it
    print('hairline mm', ' '.join(f'{k}:{(raw[k]-nz)*1000:.0f}/{(fill[k]-nz)*1000:.0f}' for k in raw))
    def paint(v):
        k = round(v.co.x / B)
        return k in fill and v.co.y < lipy + 0.06 and fill[k] - 0.002 < v.co.z < raw[k] + 0.003 and 0.002 < raw[k] - fill[k] < 0.012
    # lower the hair over a notch (faces are too big to repaint a 3 mm strip) and keep it 1.5 mm outside the skin
    bb = BVHTree.FromPolygons([v.co for v in bm.verts], [[v.index for v in f.verts] for f in body_f])
    np_ = 0
    for v in bm.verts:
        if isl[v.index] not in hair or v.co.y > lipy + 0.05: continue
        k = round(v.co.x / B)
        if k not in raw or not (0.002 < raw[k] - fill[k] < 0.012) or not (fill[k] - 0.002 < v.co.z < raw[k] + 0.006): continue
        v.co.z -= raw[k] - fill[k] + 0.001
        loc, nrm, fi, d = bb.find_nearest(v.co)
        if loc is not None and (v.co - loc).dot(nrm) < 0.0015: v.co = loc + nrm * 0.0015
        np_ += 1
    print('HAIRLINE notch bins', sum(1 for k in raw if 0.002 < raw[k] - fill[k] < 0.012), 'hair verts lowered', np_)

if 'smooth' in OPS:
    def w(v):  # cheek between nostril wing and lip corner; lips, cavity and nose stay as built
        p = v.co
        if v.normal.y > -0.3 or p.y > lipy + 0.035 or not (0.012 < abs(p.x) < 0.05) or not (mz - 0.004 < p.z < nz + 0.004): return 0
        if abs(p.x) < 0.03 and abs(p.z - mz) < 0.010: return 0
        return 1.0
    sel = [(v, w(v)) for v in head if w(v) > 0]
    ok = {v for v in head if v.normal.y < -0.3}
    for it in range(8):
        new = {}
        for v, wt in sel:
            nb = [e.other_vert(v).co for e in v.link_edges if e.other_vert(v) in ok]
            if v.is_boundary or len(nb) < 3: continue
            avg = sum(nb, Vector()) / len(nb)
            new[v] = v.co.lerp(avg, 0.5 * wt)
        for v, c in new.items(): v.co = c
    print('SMOOTH verts', len(sel))
if 'tuck' in OPS:  # an inner waistband poking out of the shirt hem (dark tabs at the back): pull it 4 mm under the shirt
    zr = {}
    for v in bm.verts: zr.setdefault(isl[v.index], []).append(v.co.z)
    shirt = max((i for i in cnt if i != body_i and 0.7 < min(zr[i]) < 1.15 and max(zr[i]) > 1.3), key=lambda i: cnt[i])
    sb = BVHTree.FromPolygons([v.co for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces if isl[f.verts[0].index] == shirt])
    hem = min(zr[shirt])
    nt = 0
    for v in bm.verts:
        i = isl[v.index]
        if i in (body_i, shirt) or not (hem - 0.01 < v.co.z < hem + 0.12): continue
        loc, nrm, fi, d = sb.find_nearest(v.co, 0.03)
        if loc is None or (v.co - loc).dot(nrm) < -0.002: continue
        lh = min((u.co.z for u in bm.verts if isl[u.index] == shirt and abs(u.co.x - v.co.x) < 0.02 and u.co.y * v.co.y > 0), default=hem)
        if v.co.z < lh + 0.006: continue  # the waistband at the hem itself stays: it hides the skin gap
        v.co.z = lh - 0.003; nt += 1  # fold the loop down onto the waistband (pushing it under the shirt stretched a skin-UV triangle)
    # skin islands = islands whose UVs sit in the head's atlas cell (the body is split into islands under clothes)
    hu = [l[uvl].uv for f in body_f for l in f.loops]
    u0, u1 = min(u.x for u in hu), max(u.x for u in hu); v0, v1 = min(u.y for u in hu), max(u.y for u in hu)
    skin = {isl[f.verts[0].index] for f in bm.faces if all(u0 <= l[uvl].uv.x <= u1 and v0 <= l[uvl].uv.y <= v1 for l in f.loops)}
    cl = BVHTree.FromPolygons([v.co for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces if isl[f.verts[0].index] not in skin])
    for v in bm.verts:  # skin that the folded loops no longer hide: 4 mm under the nearest cloth
        if isl[v.index] not in skin or abs(v.co.z - hem) > 0.05: continue
        loc, nrm, fi, d = cl.find_nearest(v.co, 0.03)
        if loc is not None and (v.co - loc).dot(nrm) > -0.003: v.co = loc - nrm * 0.004; nt += 1
    zs2 = {}
    for v in bm.verts: zs2.setdefault(isl[v.index], []).append(v.co.z)
    patch = {i for i in skin if min(zs2[i]) > hem - 0.15 and max(zs2[i]) < hem + 0.15 and len(zs2[i]) < 300}
    pt = 0
    for f in bm.faces:  # a skin scrap at the waist that the loops used to cover takes the waistband colour
        if isl[f.verts[0].index] not in patch: continue
        loc, nrm, fi, d = cl.find_nearest(f.calc_center_median())
        uv = bm.faces[fi].loops[0][uvl].uv.copy()
        for l in f.loops: l[uvl].uv = uv
        pt += 1
    print('TUCK skin scraps recoloured', len(patch), pt)
    print('TUCK verts', nt, 'shirt hem z', round(hem, 3))
if {'brows', 'scalp', 'haircontrast', 'cheekcards', 'lipsmear', 'fringe'} & set(OPS):
    import numpy as np, os
    img = next(i for i in bpy.data.images if i.name.endswith('_color.png'))
    if not img.has_data or img.size[0] == 0:
        img.filepath = os.path.join(os.path.dirname(os.path.abspath(SRC)), img.name); img.reload()
    W_, H_ = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(H_, W_, 4)
    def tex(uv): return px[min(H_ - 1, max(0, int(uv.y * H_))), min(W_ - 1, max(0, int(uv.x * W_)))]
    zs3 = {}
    for v in bm.verts: zs3.setdefault(isl[v.index], []).append(v.co)
    hairset = {i for i in cnt if i != body_i and max(p.z for p in zs3[i]) > nz + 0.07 and any(len(f.verts) for f in bm.verts[0].link_faces) }
    hair_f = [f for f in bm.faces if isl[f.verts[0].index] in hairset]
    hairc = np.mean([tex(l[uvl].uv)[:3] for f in hair_f for l in f.loops if tex(l[uvl].uv)[3] > 0.5] or [[0.1, 0.08, 0.07]], axis=0)
    def cell(faces):
        us = [l[uvl].uv for f in faces for l in f.loops]
        return (int(min(u.x for u in us) * W_), int(max(u.x for u in us) * W_) + 1, int(min(u.y for u in us) * H_), int(max(u.y for u in us) * H_) + 1)
    if 'brows' in OPS:  # soft brown brows: card colour fades from skin at the edge to brown in the middle, cut out at 8 %
        brows = [i for i in cnt if i != body_i and 40 <= cnt[i] <= 120 and nz + 0.03 < sum(p.z for p in zs3[i]) / cnt[i] < nz + 0.08
                 and max(p.x for p in zs3[i]) - min(p.x for p in zs3[i]) > 0.04]
        fore = [l[uvl].uv for f in body_f for l in f.loops if abs(l.vert.co.x) < 0.05 and nz + 0.065 < l.vert.co.z < nz + 0.085 and l.vert.normal.y < -0.5]
        skinc = np.mean([tex(u)[:3] for u in fore], axis=0) if fore else np.array([0.7, 0.5, 0.4])
        brown = 0.5 * hairc * 0.8 + 0.5 * np.array([0.12, 0.08, 0.06])
        for i in brows:
            x0, x1, y0, y1 = cell([f for f in bm.faces if isl[f.verts[0].index] == i])
            a = px[y0:y1, x0:x1, 3].copy(); t = np.clip((a - 0.08) / 0.52, 0, 1); t = t * t * (3 - 2 * t) * 0.9
            px[y0:y1, x0:x1, :3] = skinc * (1 - t[..., None]) + brown * t[..., None]
            px[y0:y1, x0:x1, 3] = np.where(a > 0.08, 1.0, 0.0)
        print('BROWS cards', len(brows), 'skin', np.round(skinc, 2), 'brown', np.round(brown, 2))
    if 'haircontrast' in OPS:  # matte hair: flatten the bright card streaks toward the mean, a touch darker
        done = set()
        for i in hairset:
            fs = [f for f in bm.faces if isl[f.verts[0].index] == i]
            if not fs: continue
            c = cell(fs)
            if c in done: continue
            done.add(c); x0, x1, y0, y1 = c; blk = px[y0:y1, x0:x1, :3]
            px[y0:y1, x0:x1, :3] = (hairc + (blk - hairc) * 0.55) * 0.92
        print('HAIR cells flattened', len(done))
    if 'scalp' in OPS:  # skin under the hair takes the hair colour: gaps between cards read as hair, not skin
        hb2 = BVHTree.FromPolygons([v.co for v in bm.verts], [[v.index for v in f.verts] for f in hair_f])
        hu = hair_f[0].loops[0][uvl].uv.copy()
        tgt = hairc * float(os.environ.get('SCALPK', 1))  # SCALPK < 1: a darker scalp, so the band under a fringe reads as hair, not grey skin
        best = min((l[uvl].uv.copy() for f in hair_f for l in f.loops if tex(l[uvl].uv)[3] > 0.9), key=lambda u: float(np.abs(tex(u)[:3] - tgt).sum()))
        ns = 0
        for f in body_f:
            c = f.calc_center_median()
            crown = os.environ.get('SCALPF') and c.z > nz + 0.09 and (c.y > lipy + 0.045 or c.z > nz + 0.115)  # far LOD: the whole crown
            near = float(os.environ.get('SCALPNEAR', 0))  # hairline gaps: skin within this distance of a hair card also takes the hair colour
            if crown or all(hb2.ray_cast(v.co + v.normal * 0.001, v.normal, 0.03)[0] is not None or v.co.z > nz + float(os.environ.get('SCALPZ', 9))
                            or (near and v.co.z > nz + 0.07 and hb2.find_nearest(v.co, near)[0] is not None) for v in f.verts):
                for l in f.loops: l[uvl].uv = best
                ns += 1
        print('SCALP faces', ns)
    if 'fringe' in OPS:  # saw-tooth fringe: blur the hair alpha where it meets the forehead and cut again at 50 %: a soft, closed edge
        from scipy.ndimage import gaussian_filter, binary_dilation
        from PIL import Image, ImageDraw
        sig = float(os.environ.get('FRINGES', 5))
        fr = [f for f in hair_f if f.calc_center_median().z < nz + 0.13 and f.normal.y < -0.2 and abs(f.calc_center_median().x) < float(os.environ.get('FRINGEX', 0.08))]
        mk = Image.new('L', (W_, H_), 0); dr = ImageDraw.Draw(mk)
        for f in fr: dr.polygon([(l[uvl].uv.x * W_, l[uvl].uv.y * H_) for l in f.loops], fill=255)
        m = binary_dilation(np.array(mk) > 0, iterations=int(sig * 2))
        a0 = px[..., 3].copy(); bl = gaussian_filter(a0, sig); new = np.where(bl > 0.5, 1.0, 0.0)
        hole = m & (a0 < 0.5) & (new > 0.5)
        if hole.any():
            w = (a0 >= 0.5).astype(np.float32); den = gaussian_filter(w, sig) + 1e-6
            for k in range(3): px[..., k][hole] = (gaussian_filter(px[..., k] * w, sig) / den)[hole]
        px[..., 3][m] = new[m]
        print('FRINGE faces', len(fr), 'texels', int(m.sum()), 'filled', int(hole.sum()), 'cut', int((m & (a0 >= 0.5) & (new < 0.5)).sum()))
    if 'cheekcards' in OPS:  # stray long-hair cards in front of the cheeks and eyes go
        kill = []
        for f in hair_f:
            for v in f.verts:
                p = v.co
                if abs(p.x) < 0.095 and p.z < nz + 0.05 and p.z > nz - 0.14:
                    h = bvh.ray_cast(Vector((p.x, -1, p.z)), Vector((0, 1, 0)))
                    if h[0] is not None and p.y < h[0].y + 0.006: kill.append(f); break
        # whole small strand islands only: cutting faces out of the main hair opened a dark slab of its inner layer (round 10)
        ki = {isl[f.verts[0].index] for f in kill if cnt[isl[f.verts[0].index]] < 150}
        kill = [f for f in hair_f if isl[f.verts[0].index] in ki]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        print('CHEEK hair faces deleted', len(kill))
    if 'lipsmear' in OPS:  # far LOD: lip colour smeared over a collapsed mouth takes the cheek skin instead
        cheek = [l[uvl].uv.copy() for f in body_f for l in f.loops if 0.025 < (l.vert.co - mc).length < 0.07 and l.vert.normal.y < -0.4]
        cols = np.array([tex(u)[:3] for u in cheek]) if cheek else None
        cu = cheek[int(np.argmin(np.abs(cols - np.median(cols, axis=0)).sum(1)))] if cheek else None  # the most typical face-skin texel
        print('cheek loops', len(cheek))
        nl = 0
        for f in body_f:
            if cu is None or (f.calc_center_median() - mc).length > 0.035: continue
            if (f.calc_center_median() - mc).length < 0.022 or any(tex(l[uvl].uv)[0] > tex(l[uvl].uv)[1] * 1.3 for l in f.loops):
                for l in f.loops: l[uvl].uv = cu
                nl += 1
        print('LIPSMEAR faces', nl)
    img.pixels[:] = px.ravel().tolist()
    dst = os.path.join(os.path.dirname(os.path.abspath(SRC)), img.name)
    img.filepath_raw = dst; img.file_format = 'PNG'; img.save()
    print('ATLAS saved', dst)
bm.to_mesh(me); me.update()
bpy.ops.wm.save_mainfile(filepath=SRC)
print('DONE')
