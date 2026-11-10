"""Clearance measure + fix for any rigged character's garments (claude-setup docs/clothing-pipeline.md, mandatory step of the Done report): garment vertex -> body surface, signed by
ray parity (same method as gate/gate_clearance.py, body mask OFF). Pushes garment vertices that sit inside (or closer than
the margin) out along the skin normal, as a smooth field, and writes it into the garment's shape keys:
  rest   -> every key block of the piece (Basis and follow keys move together, key deltas stay)
  keys   -> each body key at 1: the garment's follow key of the same name only
  poses  -> the worst pose need, as an outward offset along the rest normal on every block
  blender -b <character>.blend --factory-startup -P clearance.py -- look=king|office pieces=<substring,...> [rounds=2] [save] [report=out.json] [faces]
  Arguments (all optional, defaults are Caesar's names): body=<body object> prefix=<garment object name prefix> hair=<hair object> mask=<body hide-mask modifier>
  poses=<action,action,..> noshrink snapw lo=<mm> to=<mm> vg=<bone group prefix> swoff=<m> free poses
  dump=<n>[@action@frame]: print the n worst points (position, basis, top bone weights) at rest or in a pose frame; no fix.
  ignore_vg=<group|prefix*,..>: inside points on that body skin count as `contact` in the report (never pushed): underbust_fold, Hide_* masks.
  `report=` measures rest, every follow key at 1 and 3 frames of each pose; `faces` also measures polygon centres and edge midpoints (skin can show between
  vertices); a piece that is hidden is NOT evaluated (no pose, keys or modifiers): this script unhides the measured pieces itself.
Clearance limit: smallest >= 0 mm, 0 % inside, in every case; self-collision of the body (arm through torso) is counted apart (selfcol), not as clothing."""
import bpy, sys, json, time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
A = dict(a.split('=', 1) for a in ARGV if '=' in a)
LOOK = A.get('look', 'king'); ROUNDS = int(A.get("rounds", 2)); REPORT = A.get('report')
WANT = A.get('pieces', 'King_').split(',')
MASK = A.get('mask', 'Hide_CL_caesar-king')
REST_LO, REST_TO = 0.0015, 0.003      # m: rest pass pushes pieces closer than LO out to TO
KEY_LO, KEY_TO = 0.0005, 0.002
POSE_LO, POSE_TO = 0.0005, 0.002
if 'lo' in A:   # lo=<mm> to=<mm>: bigger margins for stubborn creases (the pass then pushes every case to this lo/to)
    KEY_LO = POSE_LO = float(A['lo']) / 1000; KEY_TO = POSE_TO = float(A.get('to', 2 * float(A['lo']))) / 1000
POSES_DEFAULT = ['MX_bend_forward_pose', 'MX_crawl', 'MX_crouch_idle', 'MX_sit_idle', 'MX_kneel_down', 'MX_lie_back_idle',
         'MX_pick_up', 'MX_dance_belly', 'MX_stretch_arms', 'MX_walk_female_sexy']
POSES = A['poses'].split(',') if A.get('poses') else POSES_DEFAULT
DIRS = [Vector((1, 0.0123, 0.0071)).normalized(), Vector((0.0091, 1, 0.0137)).normalized(), Vector((0.0111, 0.0063, 1)).normalized()]

BODY = A.get('body', 'Caesar_Body'); PREFIX = A.get('prefix', 'Caesar_Cos_'); HAIR = A.get('hair', 'Caesar_Hair')
body = bpy.data.objects[BODY]; arm = body.parent
cos = [o for o in bpy.data.objects if o.type == 'MESH' and (o.name.startswith(PREFIX) or o.name == HAIR)]
pieces = [o for o in cos if any(w in o.name for w in WANT)]
heavy = [o for o in bpy.data.objects if o.type == 'MESH' and (o.name == 'Face' or o.name.startswith(HAIR)) and o not in pieces]
VG = A.get('vg')   # vg=<prefix>: measure only vertices weighted > 0.5 to bone groups with this prefix (the braid inside the hair mesh)
VMASK = {}
for o in pieces:
    if VG:
        gi_ = {g.index: g.name for g in o.vertex_groups}
        VMASK[o.name] = {v.index for v in o.data.vertices if sum(g.weight for g in v.groups if gi_[g.group].startswith(VG)) > 0.5}
SAVED = {o: (o.hide_viewport, o.hide_render) for o in heavy + cos}
GEN = {'SUBSURF', 'SOLIDIFY', 'MULTIRES', 'MIRROR', 'ARRAY', 'BEVEL', 'REMESH', 'DECIMATE', 'WELD', 'SKIN', 'SCREW', 'BOOLEAN'}
GEN_SAVED = {}; EXTRA = {}   # EXTRA[piece] = m added to lo/to: the inner shell of a switched-off Solidify sits that far inside the cage
MASKS = []
IGN_VG = [t for t in A.get('ignore_vg', '').split(',') if t]   # ignore_vg=<body group or prefix*>,..: skin under these groups (underbust_fold, Hide_* masks) is contact, not clearance
CONTACT = {}
IGN = np.zeros(len(body.data.vertices), bool)
if IGN_VG:
    _ig = {g.index for g in body.vertex_groups if any(g.name == t or (t.endswith('*') and g.name.startswith(t[:-1])) for t in IGN_VG)}
    for v in body.data.vertices:
        if any(g.group in _ig and g.weight > 0.5 for g in v.groups): IGN[v.index] = True
    print('IGNORE_VG', IGN_VG, int(IGN.sum()), flush=True)
INTO = A.get('into')   # into=<garment key> (e.g. CH_saki): rest and pose corrections go into that key only, so other characters keep the base fit


def gen_off():
    """Fix modes move the garment's own vertices, so they measure the cage: generative modifiers (FIT_SUB subsurf first, Solidify ...)
    make the evaluated mesh longer than the vertex list and the push index past it (IndexError in fold, KeyError FACE_SRC, 2026-11-09).
    They are switched off while fixing and restored after; the subdivided surface lies inside a convex cage, so the report
    (full stack, file state) is the proof, and a Solidify's inner shell is added to the margin."""
    for o in pieces:
        for md in o.modifiers:
            if md.type in GEN and md.show_viewport:
                GEN_SAVED[(o.name, md.name)] = True; md.show_viewport = False
                if md.type == 'SUBSURF': EXTRA[o.name] = EXTRA.get(o.name, 0.0) + float(A.get('subextra', 2)) / 1000   # the limit surface lies inside a convex cage
                if md.type == 'SOLIDIFY': EXTRA[o.name] = max(EXTRA.get(o.name, 0.0), abs(md.thickness) * (1 - md.offset) / 2)
    bpy.context.view_layer.update()


def gen_on():
    for (on, mn) in GEN_SAVED: bpy.data.objects[on].modifiers[mn].show_viewport = True
    GEN_SAVED.clear(); bpy.context.view_layer.update()


def setup_state():
    for o in heavy: o.hide_viewport = True
    MASKS[:] = [md.name for md in body.modifiers if md.type == 'MASK' and md.show_viewport]   # every hide mask (Hide_<item>, Hide_<piece>) off: a masked body has holes, parity breaks
    if body.animation_data:
        for fc in body.animation_data.drivers:
            if any(f'"{mn}"' in fc.data_path for mn in MASKS) or MASK in fc.data_path: fc.mute = True
    for mn in MASKS: body.modifiers[mn].show_viewport = False
    if MASK in body.modifiers: body.modifiers[MASK].show_viewport = False
    for o in cos: o.hide_render = True
    for o in pieces: o.hide_render = False; o.hide_viewport = False   # a hidden object is not evaluated: no pose, no keys, no modifiers (Pencil was measured unposed until 2026-10-26)
    for n in A.get('also', 'King_Legs' if LOOK == 'king' else 'Shoes,Pumps').split(','):   # pieces that stay visible while measuring (they hide skin or move the feet)
        if bpy.data.objects.get(PREFIX + n): bpy.data.objects[PREFIX + n].hide_render = False
    bpy.context.view_layer.update()


def restore_state():
    for fc in (body.animation_data.drivers if body.animation_data else []):
        if any(f'"{mn}"' in fc.data_path for mn in MASKS) or MASK in fc.data_path: fc.mute = False
    for mn in MASKS: body.modifiers[mn].show_viewport = True
    for o, (hv, hr) in SAVED.items(): o.hide_viewport = hv; o.hide_render = hr
    bpy.context.view_layer.update()


def par(tree, p, d):
    n = 0; o = p.copy()
    for _ in range(40):
        loc, no, fi, dist = tree.ray_cast(o, d)
        if loc is None: break
        n += 1; o = loc + d * 1e-5
    return n & 1


EXIT = 0.003
DISAGREE = {}; NSIDE = 0.002
FACES = 'faces' in ARGV; FACE_SRC = {}; FACE_CO = {}
EXEMPT = False   # poses only: vertices trapped inside a self-intersecting body are counted apart, not as clearance
SELFCOL = {}
REST_EVAL = {}; BODY_REST = []   # full-stack rest positions (garment eval points, body verts): the other-limb test for Subsurf points
SELF_R = 0.12   # m: skin farther than this from the vertex at rest is another body part, not the garment's own skin
POSE_CAP = 0.015
AXES = [Vector(a) for a in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]


def exits_ok(tree, c):
    return sum(par(tree, c, d) for d in DIRS) < 2


def measure():
    """{piece: (sd[m], co[n,3], nearest skin point, skin normal)}; sd = +1 where the skin is farther than 3 cm."""
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    e = body.evaluated_get(dg); me = e.to_mesh()
    tree = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])
    if arm.data.pose_position == 'REST': BODY_REST[:] = [v.co[:] for v in me.vertices]
    pv0 = np.array([p.vertices[0] for p in me.polygons]); pfv = [tuple(p.vertices) for p in me.polygons]; e.to_mesh_clear()
    bco = np.empty(len(body.data.vertices) * 3); body.data.vertices.foreach_get('co', bco); bco = bco.reshape(-1, 3)
    out = {}
    for o in pieces:
        gco = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', gco); gco = gco.reshape(-1, 3)
        eo = o.evaluated_get(dg); m = eo.to_mesh(); n0 = len(m.vertices)
        if GEN_SAVED and n0 != len(gco):
            raise RuntimeError(f'{o.name}: evaluated mesh has {n0} vertices, the object {len(gco)}; a modifier that adds geometry is still on: '
                               + str([(md.type, md.name) for md in o.modifiers if md.show_viewport]))
        co = np.empty(n0 * 3); m.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        vm = VMASK.get(o.name); ref = np.arange(n0)
        if FACES:   # faces, not only vertices: triangle centres and edge midpoints are measured too (triangles: the centre of a big ring-shaped n-gon is not on the cloth) (skin can show between vertices)
            m.calc_loop_triangles(); pl = [list(t.vertices) for t in m.loop_triangles]; ed = np.array([list(e.vertices) for e in m.edges]).reshape(-1, 2)
            cen = np.array([co[v].mean(0) for v in pl]); mid = (co[ed[:, 0]] + co[ed[:, 1]]) / 2
            keepc = [i for i, v in enumerate(pl) if vm is None or all(x in vm for x in v)]
            keepm = [i for i in range(len(ed)) if vm is None or (ed[i, 0] in vm and ed[i, 1] in vm)]
            ref = np.concatenate([ref, [pl[i][0] for i in keepc], ed[keepm, 0]]); co = np.concatenate([co, cen[keepc], mid[keepm]])
            FACE_SRC[o.name] = [('poly', pl[i]) for i in keepc] + [('edge', ed[i].tolist()) for i in keepm]; FACE_CO[o.name] = co[:n0].copy()
        n = len(co)
        sd = np.full(n, 1.0); loc_a = np.zeros((n, 3)); nrm_a = np.zeros((n, 3))
        for i in range(n):
            if vm is not None and ref[i] not in vm: continue
            p = Vector(co[i]); loc, no, fi, dist = tree.find_nearest(p)
            if loc is None or dist > 0.03: continue
            if ref[i] < len(gco) and np.linalg.norm(bco[pv0[fi]] - gco[ref[i]]) > SELF_R: continue
            if ref[i] >= len(gco) and o.name in REST_EVAL and ref[i] < len(REST_EVAL[o.name]) and len(BODY_REST) == len(bco) \
                    and np.linalg.norm(np.asarray(BODY_REST[pv0[fi]]) - REST_EVAL[o.name][ref[i]]) > SELF_R: continue   # same test for Subsurf points (no cage index): rest positions of the full stack   # skin of another limb (arm through torso): the pose's own self-collision
            ins = dist < 1e-9 or sum(par(tree, p, d) for d in DIRS) >= 2
            if ins and IGN_VG and IGN[list(pfv[fi])].any():   # inside, but on masked / fold skin: contact (reported apart, never pushed)
                sd[i] = 1.0; CONTACT[o.name] = CONTACT.get(o.name, 0) + 1; continue
            if ins and not EXEMPT and (p - loc).dot(no) > NSIDE and not all(par(tree, p, d) for d in AXES):   # parity says inside, the nearest face says outside:
                ins = False; DISAGREE[o.name] = DISAGREE.get(o.name, 0) + 1   # body not watertight (genital/anus tubes) -> 6-axis vote: inside only if every axis ray agrees
            sd[i] = -dist if ins else dist; loc_a[i] = loc; nrm_a[i] = no
            if ins and EXEMPT and (p - loc).dot(no) > 0.0005:   # outside the nearest skin face yet inside the body: another body part cuts through here
                sd[i] = 1.0; SELFCOL[o.name] = SELFCOL.get(o.name, 0) + 1; continue
            if ins:   # nearest-normal exit can lead into the other thigh / cheek: try the axis exits too, keep the shortest valid one
                best = (loc + no * EXIT - p, (loc + no * EXIT - p).length)
                if not exits_ok(tree, loc + no * EXIT): best = (None, 1e9)
                for ax in AXES:
                    hl, hn, hf, hd = tree.ray_cast(p, ax)
                    if hl is None: continue
                    c = hl + ax * (EXIT + 0.001)
                    if hd + EXIT < best[1] and exits_ok(tree, c) and tree.find_nearest(c)[3] > 0.0015:
                        best = (c - p, hd + EXIT)
                if best[0] is not None: loc_a[i] = p + best[0] - no * EXIT; nrm_a[i] = no
                else:   # every way out leads into another part of the body: two body parts overlap here (inner thighs, cheeks, arm in torso), hidden by skin on both sides; counted as selfcol, not pushed
                    sd[i] = 1.0; SELFCOL[o.name] = SELFCOL.get(o.name, 0) + 1
        if arm.data.pose_position == 'REST':
            REST_EVAL[o.name] = co[:n0].copy()
        eo.to_mesh_clear()
        out[o.name] = (sd, co, loc_a, nrm_a)
    return out


def edges(o):
    me = o.data; e = np.empty(len(me.edges) * 2, int); me.edges.foreach_get('vertices', e); return e.reshape(-1, 2)


def spread(ed, disp, flagged, iters=3, k=0.6):
    """Let the push fade into unflagged neighbours (no spikes)."""
    d = disp.copy(); n = len(d); flagged = flagged.copy()
    for _ in range(iters):
        s = np.zeros_like(d); c = np.zeros(n)
        np.add.at(s, ed[:, 0], d[ed[:, 1]]); np.add.at(s, ed[:, 1], d[ed[:, 0]])
        np.add.at(c, ed[:, 0], 1); np.add.at(c, ed[:, 1], 1)
        avg = s / np.maximum(c, 1)[:, None] * k
        sel = ~flagged & (np.linalg.norm(avg, axis=1) > np.linalg.norm(d, axis=1))
        d[sel] = avg[sel]; flagged |= sel
    return d


def shift(o, d, only=None):
    """Add d to every key block of o (key deltas preserved), or only to block `only`."""
    me = o.data; ks = me.shape_keys
    for kb in ([only] if only else (list(ks.key_blocks) if ks else [])):
        a = np.empty(len(kb.data) * 3); kb.data.foreach_get('co', a); kb.data.foreach_set('co', (a.reshape(-1, 3) + d).ravel())
    if not only:
        co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); me.vertices.foreach_set('co', (co.reshape(-1, 3) + d).ravel())
    me.update()


def fold(o, a):
    """With `faces` the measure has extra points (triangle centres, edge midpoints): hand each one's value to its vertices (largest wins), so the fix moves real vertices."""
    nv = len(o.data.vertices)
    if len(a) == nv: return a
    if o.name not in FACE_SRC:
        raise RuntimeError(f'{o.name}: {len(a)} measured points for {nv} vertices without `faces`: generative modifiers were on while fixing (gen_off)')
    out = a[:nv].copy(); mag = np.linalg.norm(a, axis=1) if a.ndim == 2 else np.abs(a); cur = mag[:nv].copy()
    for j, (_kind, vs) in enumerate(FACE_SRC[o.name]):
        i = nv + j
        if mag[i] <= 0: continue
        for v in vs:
            if mag[i] > cur[v]: out[v] = a[i]; cur[v] = mag[i]
    return out


def into_block(o):
    ks = o.data.shape_keys
    return ks.key_blocks.get(INTO) if INTO and ks else None


def to_target(sd, co, loc, nrm, lo, to, o=None):
    if o is not None and EXTRA.get(o.name): lo += EXTRA[o.name]; to += EXTRA[o.name]
    flag = sd < lo
    d = np.where(flag[:, None], loc + nrm * to - co, 0.0)
    if o is not None: d = fold(o, d); flag = np.linalg.norm(d, axis=1) > 0
    return d, flag


def summarize(res, tag, worst=0):
    for nm, (sd, co, *_r) in res.items():
        print(f'{tag} {nm.split("_Cos_")[-1]:12s} min {1000 * sd.min():7.1f} mm  inside {(sd < 0).sum():4d} ({100 * (sd < 0).mean():.2f}%)', flush=True)
        for i in np.argsort(sd)[:worst]:
            if sd[i] < 0: print('    worst', i, round(1000 * sd[i], 1), np.round(co[i], 3).tolist())


def rest_state():
    arm.data.pose_position = 'REST'
    if arm.animation_data: arm.animation_data.action = None
    bpy.context.view_layer.update()


def follow_keys():
    out = {}
    for o in pieces:
        ks = o.data.shape_keys
        if ks and ks.animation_data:
            for dr in ks.animation_data.drivers:
                v = dr.driver.variables[0].targets[0]
                if True: out.setdefault(v.data_path.split('"')[1], {})[o.name] = dr.data_path.split('"')[1]
    return out


def reweight(res):
    """Chain bones follow their parent rigidly, which parts from the skin by up to 3 cm in big poses. Where a vertex hugs the
    skin (rest gap < 8 mm) its chain weight goes to the body's weights at the nearest skin point; it fades back to the full
    chain weight at 38 mm, so hanging tails and sleeves keep their chains."""
    me = body.data; bvh_co = [v.co.copy() for v in me.vertices]
    tree = BVHTree.FromPolygons(bvh_co, [p.vertices[:] for p in me.polygons])
    bgi = {g.index: g.name for g in body.vertex_groups}
    for o in pieces:
        if o.get('clr_reweighted'): continue
        sd = res[o.name][0]; co = res[o.name][1]; gi = {g.index: g.name for g in o.vertex_groups}; moved = 0
        for v in o.data.vertices:
            ch = [(g.group, g.weight) for g in v.groups if gi[g.group].startswith('CA_')]
            if not ch: continue
            gap = abs(sd[v.index])
            m = 0.0 if 'Collar' in o.name else float(np.clip((gap - 0.012) / 0.05, 0, 1))
            if m >= 1: continue
            loc, no, fi, dist = tree.find_nearest(Vector(co[v.index]))
            if loc is None: continue
            poly = me.polygons[fi]; ws = {}
            ds = [max((bvh_co[k] - loc).length, 1e-6) for k in poly.vertices]; tot = sum(1 / d for d in ds)
            for k, d in zip(poly.vertices, ds):
                for g in me.vertices[k].groups:
                    ws[bgi[g.group]] = ws.get(bgi[g.group], 0) + g.weight / d / tot
            sw = sum(ws.values()) or 1
            freed = sum(w for _, w in ch) * (1 - m)
            for gidx, w in ch: o.vertex_groups[gi[gidx]].add([v.index], w * m, 'REPLACE')
            for nm, w in ws.items():
                if nm.startswith('CA_') or nm not in o.vertex_groups and not nm in body.parent.data.bones: continue
                g = o.vertex_groups.get(nm) or o.vertex_groups.new(name=nm)
                g.add([v.index], freed * w / sw, 'ADD')
            moved += 1
        o['clr_reweighted'] = True; print('REWEIGHT', o.name.split('_Cos_')[-1], moved, flush=True)
    bpy.context.view_layer.update()


def snap_weights(res, gap=float(A.get('snapgap', 0.012))):
    """Tight pieces: where a vertex hugs the skin (rest gap < `gap`) it takes the body's weights at the nearest skin point
    (all bone groups), so it moves exactly like the skin there instead of lagging in folds (waist in a forward bend)."""
    me = body.data; bvh_co = [v.co.copy() for v in me.vertices]
    tree = BVHTree.FromPolygons(bvh_co, [p.vertices[:] for p in me.polygons])
    bgi = {g.index: g.name for g in body.vertex_groups}; bones = set(arm.data.bones.keys())
    for o in pieces:
        if o.get('clr_snapped') and 'resnap' not in ARGV: continue
        sd = res[o.name][0]; co = res[o.name][1]; n = 0
        for v in o.data.vertices:
            if abs(sd[v.index]) >= gap: continue
            loc, no, fi, dist = tree.find_nearest(Vector(co[v.index]))
            if loc is None: continue
            poly = me.polygons[fi]; ws = {}
            ds = [max((bvh_co[k] - loc).length, 1e-6) for k in poly.vertices]; tot = sum(1 / d for d in ds)
            for k, d in zip(poly.vertices, ds):
                for g in me.vertices[k].groups:
                    nm = bgi[g.group]
                    if nm in bones: ws[nm] = ws.get(nm, 0) + g.weight / d / tot
            sw = sum(ws.values())
            if sw < 1e-6: continue
            for g in o.vertex_groups:
                if g.name in bones: g.add([v.index], 0.0, 'REPLACE')
            for nm, w in ws.items():
                g = o.vertex_groups.get(nm) or o.vertex_groups.new(name=nm)
                g.add([v.index], w / sw, 'REPLACE')
            n += 1
        o['clr_snapped'] = True; print('SNAPW', o.name.split('_Cos_')[-1], n, flush=True)
    bpy.context.view_layer.update()


def breast_follow(R=float(A.get('breastw', 0)) / 1000):
    """Cloth that bridges under or between the breasts (tops, bra bands, knit) is nearest to torso skin at rest, so it keeps
    Chest/Spine weights while the breast bones swing in a bend or crouch and the breast drops through it (Saki crouch -30 mm,
    2026-11-09). Each garment vertex within R of breast skin takes a share of that skin's Breast_* weights, fading with distance."""
    from mathutils.kdtree import KDTree
    me = body.data; bgi = {g.index: g.name for g in body.vertex_groups}
    bw = {}
    for v in me.vertices:
        d = {bgi[g.group]: g.weight for g in v.groups if bgi[g.group].startswith('Breast_') and g.weight > 0}
        if sum(d.values()) > 0.3: bw[v.index] = d
    kd = KDTree(len(bw)); ids = list(bw)
    for k, i in enumerate(ids): kd.insert(me.vertices[i].co, k)
    kd.balance()
    for o in pieces:
        if o.get('clr_breast'): continue
        gi = {g.index: g.name for g in o.vertex_groups}; n = 0
        for v in o.data.vertices:
            co, k, d = kd.find(v.co)
            if co is None or d >= R: continue
            src = bw[ids[k]]; f = (1 - d / R) * min(1.0, sum(src.values()))
            have = sum(g.weight for g in v.groups if gi[g.group].startswith('Breast_'))
            if have >= f: continue
            f -= have
            for g in v.groups:
                if gi[g.group] in arm.data.bones and not gi[g.group].startswith('Breast_'): g.weight *= (1 - f)
            tot = sum(src.values())
            for nm, w in src.items():
                g = o.vertex_groups.get(nm) or o.vertex_groups.new(name=nm); g.add([v.index], f * w / tot, 'ADD')
            n += 1
        o['clr_breast'] = True; print('BREASTW', o.name.split('_Cos_')[-1], n, flush=True)
    bpy.context.view_layer.update()


def dqs_place(o):
    """Armature_DQS right after the main Armature modifier, as on the body. Appended at the end (after a Subsurf-first stack's
    Shrinkwrap) its multi-modifier blend exploded sleeves 30 cm in arm poses (Saki r5, 2026-11-10)."""
    names = [m.name for m in o.modifiers]
    if 'Armature_DQS' not in names: return
    main = next((i for i, m in enumerate(o.modifiers) if m.type == 'ARMATURE' and m.name != 'Armature_DQS'), None)
    if main is not None:
        with bpy.context.temp_override(object=o): bpy.ops.object.modifier_move_to_index(modifier='Armature_DQS', index=main + 1)


def add_dqs(res):
    """The body twists forearm and wrist with a second, dual-quaternion Armature modifier on the group Twist_DQS; a
    garment skinned linearly only parts from the skin by up to 3 cm there. Same group (nearest skin point) and modifier."""
    me = body.data; co_b = [v.co.copy() for v in me.vertices]
    tree = BVHTree.FromPolygons(co_b, [p.vertices[:] for p in me.polygons]); tg = body.vertex_groups['Twist_DQS'].index
    wb = np.array([next((g.weight for g in v.groups if g.group == tg), 0.0) for v in me.vertices])
    for o in pieces:
        if 'Armature_DQS' in o.modifiers: dqs_place(o); continue
        co = res[o.name][1]; w = np.zeros(len(co))
        for i, p in enumerate(co):
            loc, no, fi, d = tree.find_nearest(Vector(p))
            if loc is None: continue
            ps = me.polygons[fi].vertices; ds = [max((co_b[k] - loc).length, 1e-6) for k in ps]
            w[i] = sum(wb[k] / d for k, d in zip(ps, ds)) / sum(1 / d for d in ds)
        if w.max() < 0.01: continue
        g = o.vertex_groups.get('Twist_DQS') or o.vertex_groups.new(name='Twist_DQS')
        for i in np.nonzero(w > 0.001)[0]: g.add([int(i)], float(w[i]), 'REPLACE')
        m = o.modifiers.new('Armature_DQS', 'ARMATURE'); m.object = arm
        m.use_deform_preserve_volume = True; m.use_multi_modifier = True; m.vertex_group = 'Twist_DQS'
        dqs_place(o)
        print('DQS', o.name.split('_Cos_')[-1], int((w > 0.01).sum()), flush=True)
    bpy.context.view_layer.update()


SW = 'Clearance'; PROXY = A.get('proxy', BODY.replace('_Body', '') + '_ClearanceProxy'); SW_OFFSET = float(A.get('swoff', 0.003))   # folds narrower than 2 x offset push the vertex into the other wall


def proxy():
    """Hidden twin of the body (same mesh data, so every key and slider), skinned like the body, without the hide mask: the
    target of each garment's Shrinkwrap 'Outside', which keeps every vertex >= offset off the skin in any pose or slider."""
    ob = bpy.data.objects.get(PROXY)
    if not ob:
        ob = bpy.data.objects.new(PROXY, body.data); ob.parent = arm; ob.matrix_parent_inverse = body.matrix_parent_inverse.copy()
        for c in body.users_collection: c.objects.link(ob)
        for md in body.modifiers:
            if md.type == 'ARMATURE':
                n = ob.modifiers.new(md.name, 'ARMATURE'); n.object = md.object; n.use_deform_preserve_volume = md.use_deform_preserve_volume
                n.use_multi_modifier = md.use_multi_modifier; n.vertex_group = md.vertex_group
        ob.hide_render = True; ob.display_type = 'WIRE'
        ob.hide_set(True)
    sync_proxy_mods(ob)
    return ob


def sync_proxy_mods(ob):
    """The twin must deform exactly like the body, or the garment is wrapped around a different skin: the neighbour's body has a breast
    Corrective Smooth + self-Shrinkwrap (CS_Br, SW_Br_S) that move the bust up to 8.5 mm, the proxy had only the Armatures (knit -27 mm at the bust in the
    report). Copies every non-Mask body modifier the proxy lacks, in body order (Mask = the hide masks, the proxy stays unmasked)."""
    was = ob.hide_get(); ob.hide_set(False)
    try:
        for md in body.modifiers:
            if md.type == 'MASK' or md.name in ob.modifiers: continue
            with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body, ob], selected_editable_objects=[body, ob]):
                bpy.ops.object.modifier_copy_to_selected(modifier=md.name)
            print('PROXY_MOD', md.name, flush=True)
    finally:
        ob.hide_set(was)


SW_NAMES = [SW, SW + '2', SW + '3']   # stacked: a vertex the first pass leaves in a fold is caught by the next one
FREE = 'SW_Free'


def shrinkwrap(o, target):
    if 'noshrink' in ARGV:   # key/pose corrections alone clear this piece: no Shrinkwrap stack (it only adds wrong-side pushes in creases)
        for nm in SW_NAMES:
            if nm in o.modifiers: o.modifiers.remove(o.modifiers[nm])
        return
    for nm in SW_NAMES:
        md = o.modifiers.get(nm) or o.modifiers.new(nm, 'SHRINKWRAP')
        md.target = target; md.wrap_method = 'NEAREST_SURFACEPOINT'; md.wrap_mode = A.get('swmode', 'OUTSIDE'); md.offset = SW_OFFSET
        o.modifiers.move(o.modifiers.find(nm), len(o.modifiers) - 1)
        if FREE in o.vertex_groups: md.vertex_group = FREE; md.invert_vertex_group = True


def sw_set(on):
    for o in pieces:
        for nm in SW_NAMES:
            if nm in o.modifiers: o.modifiers[nm].show_viewport = on
    bpy.context.view_layer.update()


def free_verts(with_poses=False):
    """Vertices that stay inside after the stacked Shrinkwrap (creases where the nearest skin lies in the other fold) are
    left out of it (group SW_Free, 1-ring at half weight); their key-corrected base positions already clear the skin."""
    bad = {o.name: set() for o in pieces}
    def look(tag):
        for n, (sd, *_r) in measure().items():
            ids = np.nonzero(sd < 0.0005)[0]
            if len(ids): print('FREE', tag, n.split('_Cos_')[-1], len(ids), flush=True)
            bad[n].update(int(i) for i in ids)
    rest_state(); look('rest')
    kb = body.data.shape_keys.key_blocks
    for k in ([] if 'nokeyrep' in ARGV else sorted(follow_keys())):   # nokeyrep: rest + poses only (the gate table)
        old = kb[k].value; kb[k].value = 1.0; bpy.context.view_layer.update(); look('key ' + k); kb[k].value = old
    if with_poses:
        for case in pose_cases():
            if 'stretch_arms@107' in case: continue   # the arm runs through the torso: animation, not clothing
            look(case)
    for o in pieces:
        g = o.vertex_groups.get(FREE) or o.vertex_groups.new(name=FREE)
        g.remove(list(range(len(o.data.vertices))))
        ed = edges(o); ring = set()
        for a, b in ed:
            if a in bad[o.name]: ring.add(int(b))
            if b in bad[o.name]: ring.add(int(a))
        if bad[o.name]: g.add(sorted(bad[o.name]), 1.0, 'REPLACE')
        r = sorted(ring - bad[o.name])
        if r: g.add(r, 0.5, 'REPLACE')
        shrinkwrap(o, bpy.data.objects[PROXY])
        print('FREEGROUP', o.name.split('_Cos_')[-1], len(bad[o.name]), '+ring', len(r), flush=True)


SMOOTH_R = float(A.get('smooth', 0)) / 1000   # smooth=<mm>: after the rest fix, the correction field is blurred over this radius (all shells of the piece together: patch, waistband, pocket) and fixed again, so pushes leave no ridges


def block_co(o, kb=None):
    kb = kb or (into_block(o) or o.data.shape_keys.key_blocks[0]); a = np.empty(len(kb.data) * 3); kb.data.foreach_get('co', a); return a.reshape(-1, 3)


def blur_field(o, D, r):
    from mathutils.kdtree import KDTree
    co = block_co(o, o.data.shape_keys.key_blocks[0]); n = len(co); act = np.linalg.norm(D, axis=1) > 1e-6
    if not act.any(): return D
    kd = KDTree(n)
    for i, c in enumerate(co): kd.insert(c, i)
    kd.balance(); out = D.copy(); near = set()
    for i in np.nonzero(act)[0]:
        for _c, j, _d in kd.find_range(co[i], r): near.add(j)
    for i in near:
        s = np.zeros(3); w = 0.0
        for _c, j, dd in kd.find_range(co[i], r):
            g = np.exp(-(dd / (0.5 * r)) ** 2); s += g * D[j]; w += g
        out[i] = s / w
    return out


def fix_rest(max_it=8):
    _fix_rest(max_it)
    if SMOOTH_R:
        for cyc in range(2):
            for o in pieces:
                kb = into_block(o) or o.data.shape_keys.key_blocks[0]; cur = block_co(o, kb); D = cur - ORIG[o.name]
                Ds = blur_field(o, D, SMOOTH_R); shift(o, Ds - D, only=into_block(o))
            bpy.context.view_layer.update(); _fix_rest(max_it, f'SMOOTH{cyc}_')


MAXFIX = float(A.get('maxfix', 25)) / 1000   # m: a rest correction never moves a vertex farther than this from where it started (a point trapped in an
                                             # overlap of two body parts otherwise walks out step by step and leaves a spike: Saki skirt frill 2026-11-09)


def clamp(o):
    if o.name not in ORIG: return
    kb = into_block(o) or o.data.shape_keys.key_blocks[0]; cur = block_co(o, kb); D = cur - ORIG[o.name]
    L = np.linalg.norm(D, axis=1); big = L > MAXFIX
    if big.any(): shift(o, np.where(big[:, None], D * (MAXFIX / np.maximum(L, 1e-9))[:, None] - D, 0.0), only=into_block(o))


def _fix_rest(max_it=8, tag=''):
    rest_state()
    for it in range(max_it):
        res = measure(); summarize(res, f'{tag}REST{it}')
        if all(sd.min() >= REST_LO for sd, *_r in res.values()): break
        for o in pieces:
            sd, co, loc, nrm = res[o.name]; d, flag = to_target(sd, co, loc, nrm, REST_LO, REST_TO, o)
            if flag.any(): shift(o, spread(edges(o), d, flag, iters=2), only=into_block(o)); clamp(o)
        bpy.context.view_layer.update()


def fix_keys(iters=int(A.get('keyit', 4))):
    """Each follow key is corrected up to `iters` times at its own state (measure, push, measure again) until it clears."""
    kb = body.data.shape_keys.key_blocks
    for k, per in sorted(follow_keys().items()):
        old = kb[k].value; kb[k].value = 1.0; bpy.context.view_layer.update()
        for it in range(iters):
            res = measure(); left = 0
            for pn, gk in per.items():
                o = bpy.data.objects[pn]; sd, co, loc, nrm = res[pn]; d, flag = to_target(sd, co, loc, nrm, KEY_LO, KEY_TO, o)
                if flag.any():
                    left += 1
                    shift(o, spread(edges(o), d, flag), only=o.data.shape_keys.key_blocks[gk])
                    print('KEYFIX', k, pn.split('_Cos_')[-1], it, int(flag.sum()), 'min', round(1000 * sd.min(), 1), flush=True)
            if not left: break
            bpy.context.view_layer.update()
        kb[k].value = old
    bpy.context.view_layer.update()


def pose_cases():
    arm.data.pose_position = 'POSE'; arm.animation_data_create()
    for nm in POSES:
        a = bpy.data.actions.get(nm)
        if not a: continue
        arm.animation_data.action = a; f0, f1 = a.frame_range
        for f in (f0, (f0 + f1) / 2, f1):
            bpy.context.scene.frame_set(int(f)); yield f'{nm}@{int(f)}'


def rest_normals(o):
    rest_state(); eo = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); m = eo.to_mesh()
    nr = np.empty(len(m.vertices) * 3); m.vertices.foreach_get('normal', nr); eo.to_mesh_clear(); return nr.reshape(-1, 3)


def fix_poses():
    global EXEMPT
    EXEMPT = True   # self-collision of the body (arm through torso) is not the garment's clearance
    need = {o.name: np.zeros(len(o.data.vertices)) for o in pieces}
    for case in pose_cases():
        res = measure()
        for o in pieces:
            sd = res[o.name][0]; amt = np.minimum(np.where(sd < POSE_LO, POSE_TO - sd, 0.0), POSE_CAP); amt[sd >= 1.0] = 0
            need[o.name] = np.maximum(need[o.name], fold(o, amt))
        print('pose', case, {k.split('_Cos_')[-1]: round(1000 * float(v.max()), 1) for k, v in need.items()}, flush=True)
    if 'diag' in ARGV:
        for o in pieces:
            gi = {g.index: g.name for g in o.vertex_groups}; nd = need[o.name]; big = np.nonzero(nd > 0.006)[0]
            tot = {}; allc = 0.0
            for i in big:
                for g in o.data.vertices[i].groups:
                    tot[gi[g.group]] = tot.get(gi[g.group], 0) + g.weight
            ch = sum(w for k, w in tot.items() if k.startswith('CA_')) / max(len(big), 1)
            top = sorted(tot.items(), key=lambda t: -t[1])[:6]
            print('DIAG', o.name.split('_Cos_')[-1], 'verts>6mm', len(big), 'chain share', round(ch, 2), [(k, round(w / max(len(big), 1), 2)) for k, w in top])
            if len(big): print('   DIAGPOS', np.round(np.array([o.data.vertices[i].co for i in big[:6]]), 3).tolist())
        return
    EXEMPT = False
    rn = {o.name: rest_normals(o) for o in pieces}
    for o in pieces:
        flag = need[o.name] > 0
        if flag.any(): shift(o, spread(edges(o), rn[o.name] * need[o.name][:, None], flag, iters=4, k=0.75), only=into_block(o))
    bpy.context.view_layer.update()


def report():
    out = {}; kb = body.data.shape_keys.key_blocks
    row = lambda res: {n.split('_Cos_')[-1]: dict(min_mm=round(1000 * float(sd.min()), 1), inside=int((sd < 0).sum()), n=len(sd),
                                                pct_inside=round(100 * float((sd < 0).mean()), 2)) for n, (sd, *_r) in res.items()}
    rest_state(); SELFCOL.clear(); CONTACT.clear(); out['rest'] = row(measure())
    for n, c in SELFCOL.items(): out['rest'][n.split('_Cos_')[-1]]['selfcol'] = c
    for n, c in CONTACT.items(): out['rest'][n.split('_Cos_')[-1]]['contact'] = c
    for k in ([] if 'nokeyrep' in ARGV else sorted(follow_keys())):   # nokeyrep: rest + poses only (the gate table)
        old = kb[k].value; kb[k].value = 1.0; bpy.context.view_layer.update(); out['key ' + k] = row(measure()); kb[k].value = old
    global EXEMPT
    EXEMPT = True
    for case in pose_cases():
        SELFCOL.clear(); CONTACT.clear(); r = row(measure())
        for n, c in SELFCOL.items(): r[n.split('_Cos_')[-1]]['selfcol'] = c
        for n, c in CONTACT.items(): r[n.split('_Cos_')[-1]]['contact'] = c
        out[case] = r; print('report', case, dict(SELFCOL), flush=True)
    EXEMPT = False
    json.dump(out, open(REPORT, 'w'), indent=1)
    worst = {}
    for case, r in out.items():
        for p, v in r.items():
            w = worst.setdefault(p, [9e9, 0, ''])
            if v['min_mm'] < w[0]: w[0] = v['min_mm']; w[2] = case
            w[1] = max(w[1], v['inside'])
    print('WORST', worst)


def case_debug(spec):
    nm, f = spec.split('@'); a = bpy.data.actions[nm]; rest_state(); r0 = measure(); add_dqs(r0); reweight(r0) if 'rw' in ARGV else None
    arm.data.pose_position = 'POSE'; arm.animation_data_create(); arm.animation_data.action = a; bpy.context.scene.frame_set(int(f))
    if 'nodqs' in ARGV:
        if 'dqs_twist' in arm: arm['dqs_twist'] = 0.0   # Treiber am Modifier (2026-10-26)
        body.modifiers['Armature_DQS'].show_viewport = False
        for o in pieces:
            if 'Armature_DQS' in o.modifiers: o.modifiers['Armature_DQS'].show_viewport = False
    if 'nokeys' in ARGV:
        for o in [body] + pieces:
            if o.data.shape_keys: 
                if o.data.shape_keys.animation_data: o.data.shape_keys.animation_data.drivers.clear() if False else None
                for k in o.data.shape_keys.key_blocks: k.mute = True
    bpy.context.view_layer.update()
    res = measure(); bgi = {g.index: g.name for g in body.vertex_groups}
    for o in pieces:
        sd, co, loc, nrm = res[o.name]; gi = {g.index: g.name for g in o.vertex_groups}
        for i in np.argsort(sd)[:5]:
            if sd[i] > 0: continue
            if i >= len(o.data.vertices): print('FACEPT', i, round(1000 * sd[i], 1), np.round(co[i], 3).tolist(), FACE_SRC[o.name][i - len(o.data.vertices)][0], [np.round(FACE_CO[o.name][k], 3).tolist() for k in FACE_SRC[o.name][i - len(o.data.vertices)][1]][:4]); continue
            v = o.data.vertices[i]; top = sorted([(gi[g.group], round(g.weight, 2)) for g in v.groups], key=lambda t: -t[1])[:5]
            if 'near' in ARGV:
                dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); me = e.to_mesh()
                tr = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])
                pp = Vector(co[i]); l, nn, fi, dd = tr.find_nearest(pp); bv = body.data.vertices[me.polygons[fi].vertices[0]]
                print('   NEAR body', [(bgi[g.group], round(g.weight, 2)) for g in bv.groups][:4], 'dist', round(dd, 4), 'evalpos', np.round(co[i], 3).tolist(), 'skin', np.round(l, 3).tolist()); e.to_mesh_clear()
            print('CASE', o.name.split('_Cos_')[-1], i, round(1000 * sd[i], 1), np.round(o.data.vertices[i].co, 3).tolist(), top, flush=True)
    for fc in body.animation_data.drivers: pass


t0 = time.time()
setup_state()
if not REPORT and not A.get('dump') and not A.get('local'): gen_off()
ORIG = {o.name: block_co(o) for o in pieces if o.data.shape_keys}
if A.get('keycase'):   # keycase=<body key>: list the worst points with that key at 1 (vertex or face point, position, bone weights)
    rest_state(); kb = body.data.shape_keys.key_blocks; kb[A['keycase']].value = 1.0; bpy.context.view_layer.update(); res = measure()
    for o in pieces:
        sd, co, loc, nrm = res[o.name]; nv = len(o.data.vertices); gi = {g.index: g.name for g in o.vertex_groups}
        for i in np.argsort(sd)[:12]:
            if sd[i] >= 0: break
            vs = [i] if i < nv else FACE_SRC[o.name][i - nv][1]
            print('KEYPT', o.name.split('_Cos_')[-1], 'face' if i >= nv else 'vert', int(i), round(1000 * sd[i], 1), np.round(co[i], 3).tolist(), 'verts', vs[:3],
                  [(gi[g.group], round(g.weight, 2)) for g in o.data.vertices[vs[0]].groups][:3])
    if 'probe' in ARGV:
        dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); me = e.to_mesh()
        tr = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])
        for o in pieces:
            sd, co, loc, nrm = res[o.name]
            for i in np.argsort(sd)[:6]:
                p = Vector(co[i]); l, nn, fi, dd = tr.find_nearest(p)
                print('PROBE', int(i), round(1000 * sd[i], 1), 'dist', round(1000 * dd, 1), 'par', [par(tr, p, d) for d in DIRS], 'p-loc.n', round(1000 * (p - l).dot(nn), 1),
                      'axhits', [round(1000 * tr.ray_cast(p, ax)[3], 1) if tr.ray_cast(p, ax)[0] else None for ax in AXES])
    restore_state(); sys.exit(0)
if A.get('local'):   # local=<rounds> [to=<mm>] [ring=<n>]: rest fix measured on the FULL stack (Subsurf/Shrinkwrap on); each inside point moves its
    from mathutils.kdtree import KDTree   # nearest cage vertex out along the skin normal by depth + to, in the into= key only, spread over `ring` edge rings
    TO_L = float(A.get('to', 2.5)) / 1000; RING = int(A.get('ring', 2))
    for rnd in range(int(A['local'])):
        rest_state(); res = measure(); left = 0
        for o in pieces:
            sd, co, loc, nrm = res[o.name]; nv = len(o.data.vertices); bad = np.where(sd < 0)[0]
            print('LOCAL', rnd, o.name.split('_Cos_')[-1], len(bad), round(1000 * float(sd.min()), 1), flush=True)
            if not len(bad): continue
            left += len(bad); gm = [md for md in o.modifiers if md.type in GEN and md.show_viewport]
            for md in gm: md.show_viewport = False
            dg = bpy.context.evaluated_depsgraph_get(); dg.update(); eo = o.evaluated_get(dg); mm = eo.to_mesh(); cage = [v.co.copy() for v in mm.vertices]; eo.to_mesh_clear()
            for md in gm: md.show_viewport = True
            kd = KDTree(nv); [kd.insert(c, i) for i, c in enumerate(cage)]; kd.balance()
            disp = np.zeros((nv, 3)); w = np.zeros(nv)
            for i in bad:
                vi = kd.find(Vector(co[i]))[1]; d = (np.asarray(loc[i]) - co[i]) + np.asarray(nrm[i]) * TO_L   # to the skin point, then TO_L outside
                if np.linalg.norm(d) > np.linalg.norm(disp[vi]): disp[vi] = d; w[vi] = 1
            ed = np.array([e.vertices[:] for e in o.data.edges])
            for _r in range(RING):
                acc = np.zeros_like(disp); c_ = np.zeros(nv)
                np.add.at(acc, ed[:, 0], disp[ed[:, 1]]); np.add.at(acc, ed[:, 1], disp[ed[:, 0]]); np.add.at(c_, ed[:, 0], w[ed[:, 1]]); np.add.at(c_, ed[:, 1], w[ed[:, 0]])
                m_ = (w == 0) & (c_ > 0); disp[m_] = 0.5 * acc[m_] / c_[m_][:, None]; w[m_] = 1
            shift(o, disp, only=into_block(o))
        bpy.context.view_layer.update()
        if not left: break
    rest_state(); summarize(measure(), 'LOCAL FINAL', 6); restore_state()
    if 'save' in ARGV: bpy.ops.wm.save_mainfile(); print('SAVED')
    sys.exit(0)
if A.get('dump'):   # dump=<n>[@action@frame]: the n worst points (rest, or that pose frame) with position and top bone weights, to locate a local fix
    spec = A['dump'].split('@'); rest_state()
    if len(spec) == 3: arm.data.pose_position = 'POSE'; arm.animation_data_create(); arm.animation_data.action = bpy.data.actions[spec[1]]; bpy.context.scene.frame_set(int(spec[2])); EXEMPT = True
    res = measure()
    for o in pieces:
        sd, co, loc, nrm = res[o.name]; nv = len(o.data.vertices); gi = {g.index: g.name for g in o.vertex_groups}
        for i in np.argsort(sd)[:int(spec[0])]:
            if sd[i] >= 0: break
            ne = len(FACE_CO.get(o.name, co)); vs = [int(i)] if i < ne else FACE_SRC[o.name][i - ne][1]
            if vs[0] >= nv: print('DUMP', o.name.split('_Cos_')[-1], 'eval', int(vs[0]), round(1000 * sd[i], 1), 'at', np.round(co[i], 3).tolist(), flush=True); continue
            print('DUMP', o.name.split('_Cos_')[-1], int(vs[0]), round(1000 * sd[i], 1), 'at', np.round(co[i], 3).tolist(), 'basis', np.round(o.data.vertices[vs[0]].co, 3).tolist(),
                  sorted([(gi[g.group], round(g.weight, 2)) for g in o.data.vertices[vs[0]].groups if not gi[g.group].startswith(('FIT', 'Clear'))], key=lambda t: -t[1])[:3], flush=True)
    restore_state(); sys.exit(0)
if A.get('case'):
    case_debug(A['case']); gen_on(); restore_state(); sys.exit(0)
try:
    if 'free' in ARGV:
        tgt = proxy()
        for o in pieces: shrinkwrap(o, tgt)
        sw_set(True); free_verts('poses' in ARGV)
    elif REPORT:   # measures the FILE state (stacks as saved, viewport as saved); `raw` switches the Clearance* stacks off to see the bare corrections
        if 'raw' in ARGV: sw_set(False)
        if bpy.data.objects.get(PROXY): proxy()   # same modifiers as the body (sync_proxy_mods); the file state is only saved with `save`
        report()
    else:
        tgt = proxy()
        for o in pieces:
            for nm in SW_NAMES:
                if nm in o.modifiers: o.modifiers[nm].show_viewport = False
        rest_state(); r0 = measure(); add_dqs(r0); reweight(r0)
        if 'snapw' in ARGV: snap_weights(r0)
        if A.get('breastw'): breast_follow()
        fix_rest()
        if 'diag' in ARGV: fix_poses(); ROUNDS = 0
        for r in range(ROUNDS):
            if 'nokeys' not in ARGV: fix_keys(); fix_rest()   # nokeys: the character's sliders are fixed values; bone-driven correctives are covered by the poses
            if 'poses' in ARGV: fix_poses(); fix_rest()
        for o in pieces: shrinkwrap(o, tgt)
        sw_set(True)   # the fix switched the stacks off while correcting: leave them ON in the saved file
        rest_state(); summarize(measure(), 'FINAL REST', 6)
        if 'dbg' in ARGV:
            o = bpy.data.objects['Caesar_Cos_King_Legs']; sd, co, loc, nrm = measure()[o.name]; i = int(np.argmin(sd))
            dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); me = e.to_mesh()
            tree = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])
            p = Vector(co[i]); print('DBG', i, p, sd[i], 'loc', loc[i], 'nrm', nrm[i])
            for ax in AXES:
                hl, hn, hf, hd = tree.ray_cast(p, ax); print('  ax', tuple(ax), hl, hd, exits_ok(tree, hl + ax * EXIT) if hl else None)
            print('  par', [par(tree, p, d) for d in DIRS], 'near', tree.find_nearest(p))
finally:
    gen_on()
    arm.data.pose_position = 'POSE'
    if arm.animation_data: arm.animation_data.action = None
    restore_state()
if 'save' in ARGV and not REPORT:
    bpy.ops.wm.save_mainfile(); print('SAVED')
print('DONE', round(time.time() - t0))
if 'dbg' in ARGV:
    pass
