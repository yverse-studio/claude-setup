"""Clearance measure + fix for any rigged character's garments (claude-setup docs/clothing-pipeline.md, mandatory step of the Done report): garment vertex -> body surface, signed by
ray parity (same method as gate/gate_clearance.py, body mask OFF). Pushes garment vertices that sit inside (or closer than
the margin) out along the skin normal, as a smooth field, and writes it into the garment's shape keys:
  rest   -> every key block of the piece (Basis and follow keys move together, key deltas stay)
  keys   -> each body key at 1: the garment's follow key of the same name only
  poses  -> the worst pose need, as an outward offset along the rest normal on every block
  blender -b <character>.blend --factory-startup -P clearance.py -- look=king|office pieces=<substring,...> [rounds=2] [save] [report=out.json] [faces]
  Arguments (all optional, defaults are Caesar's names): body=<body object> prefix=<garment object name prefix> hair=<hair object> mask=<body hide-mask modifier>
  poses=<action,action,..> noshrink snapw lo=<mm> to=<mm> vg=<bone group prefix> swoff=<m> free poses
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


def setup_state():
    for o in heavy: o.hide_viewport = True
    for fc in body.animation_data.drivers:
        if MASK in fc.data_path: fc.mute = True
    body.modifiers[MASK].show_viewport = False
    for o in cos: o.hide_render = True
    for o in pieces: o.hide_render = False; o.hide_viewport = False   # a hidden object is not evaluated: no pose, no keys, no modifiers (Pencil was measured unposed until 2026-10-26)
    for n in A.get('also', 'King_Legs' if LOOK == 'king' else 'Shoes,Pumps').split(','):   # pieces that stay visible while measuring (they hide skin or move the feet)
        if bpy.data.objects.get(PREFIX + n): bpy.data.objects[PREFIX + n].hide_render = False
    bpy.context.view_layer.update()


def restore_state():
    for fc in body.animation_data.drivers:
        if MASK in fc.data_path: fc.mute = False
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
FACES = 'faces' in ARGV; FACE_SRC = {}; FACE_CO = {}
EXEMPT = False   # poses only: vertices trapped inside a self-intersecting body are counted apart, not as clearance
SELFCOL = {}
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
    pv0 = np.array([p.vertices[0] for p in me.polygons]); e.to_mesh_clear()
    bco = np.empty(len(body.data.vertices) * 3); body.data.vertices.foreach_get('co', bco); bco = bco.reshape(-1, 3)
    out = {}
    for o in pieces:
        gco = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', gco); gco = gco.reshape(-1, 3)
        eo = o.evaluated_get(dg); m = eo.to_mesh(); n0 = len(m.vertices)
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
            if ref[i] < len(gco) and np.linalg.norm(bco[pv0[fi]] - gco[ref[i]]) > SELF_R: continue   # skin of another limb (arm through torso): the pose's own self-collision
            ins = dist < 1e-9 or sum(par(tree, p, d) for d in DIRS) >= 2
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
                elif EXEMPT:   # every way out leads into another part of the body: the pose makes the body cut through itself
                    sd[i] = 1.0; SELFCOL[o.name] = SELFCOL.get(o.name, 0) + 1
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


def to_target(sd, co, loc, nrm, lo, to):
    flag = sd < lo
    return np.where(flag[:, None], loc + nrm * to - co, 0.0), flag


def summarize(res, tag, worst=0):
    for nm, (sd, co, *_r) in res.items():
        print(f'{tag} {nm.split("_Cos_")[1]:12s} min {1000 * sd.min():7.1f} mm  inside {(sd < 0).sum():4d} ({100 * (sd < 0).mean():.2f}%)', flush=True)
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


def snap_weights(res, gap=0.012):
    """Tight pieces: where a vertex hugs the skin (rest gap < `gap`) it takes the body's weights at the nearest skin point
    (all bone groups), so it moves exactly like the skin there instead of lagging in folds (waist in a forward bend)."""
    me = body.data; bvh_co = [v.co.copy() for v in me.vertices]
    tree = BVHTree.FromPolygons(bvh_co, [p.vertices[:] for p in me.polygons])
    bgi = {g.index: g.name for g in body.vertex_groups}; bones = set(arm.data.bones.keys())
    for o in pieces:
        if o.get('clr_snapped'): continue
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


def add_dqs(res):
    """The body twists forearm and wrist with a second, dual-quaternion Armature modifier on the group Twist_DQS; a
    garment skinned linearly only parts from the skin by up to 3 cm there. Same group (nearest skin point) and modifier."""
    me = body.data; co_b = [v.co.copy() for v in me.vertices]
    tree = BVHTree.FromPolygons(co_b, [p.vertices[:] for p in me.polygons]); tg = body.vertex_groups['Twist_DQS'].index
    wb = np.array([next((g.weight for g in v.groups if g.group == tg), 0.0) for v in me.vertices])
    for o in pieces:
        if 'Armature_DQS' in o.modifiers: continue
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
    return ob


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
    for k in sorted(follow_keys()):
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


def fix_rest(max_it=8):
    rest_state()
    for it in range(max_it):
        res = measure(); summarize(res, f'REST{it}')
        if all(sd.min() >= REST_LO for sd, *_r in res.values()): break
        for o in pieces:
            sd, co, loc, nrm = res[o.name]; d, flag = to_target(sd, co, loc, nrm, REST_LO, REST_TO)
            if flag.any(): shift(o, spread(edges(o), d, flag, iters=2))
        bpy.context.view_layer.update()


def fix_keys():
    kb = body.data.shape_keys.key_blocks
    for k, per in sorted(follow_keys().items()):
        old = kb[k].value; kb[k].value = 1.0; bpy.context.view_layer.update(); res = measure()
        for pn, gk in per.items():
            o = bpy.data.objects[pn]; sd, co, loc, nrm = res[pn]; d, flag = to_target(sd, co, loc, nrm, KEY_LO, KEY_TO)
            if flag.any():
                shift(o, spread(edges(o), d, flag), only=o.data.shape_keys.key_blocks[gk])
                print('KEYFIX', k, pn.split('_Cos_')[-1], int(flag.sum()), 'min', round(1000 * sd.min(), 1), flush=True)
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
            need[o.name] = np.maximum(need[o.name], amt)
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
        if flag.any(): shift(o, spread(edges(o), rn[o.name] * need[o.name][:, None], flag, iters=4, k=0.75))
    bpy.context.view_layer.update()


def report():
    out = {}; kb = body.data.shape_keys.key_blocks
    row = lambda res: {n.split('_Cos_')[-1]: dict(min_mm=round(1000 * float(sd.min()), 1), inside=int((sd < 0).sum()), n=len(sd),
                                                pct_inside=round(100 * float((sd < 0).mean()), 2)) for n, (sd, *_r) in res.items()}
    rest_state(); out['rest'] = row(measure())
    for k in sorted(follow_keys()):
        old = kb[k].value; kb[k].value = 1.0; bpy.context.view_layer.update(); out['key ' + k] = row(measure()); kb[k].value = old
    global EXEMPT
    EXEMPT = True
    for case in pose_cases():
        SELFCOL.clear(); r = row(measure())
        for n, c in SELFCOL.items(): r[n.split('_Cos_')[-1]]['selfcol'] = c
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
if A.get('case'):
    case_debug(A['case']); restore_state(); sys.exit(0)
try:
    if 'free' in ARGV:
        tgt = proxy()
        for o in pieces: shrinkwrap(o, tgt)
        sw_set(True); free_verts('poses' in ARGV)
    elif REPORT:
        tgt = proxy()
        for o in pieces:
            shrinkwrap(o, tgt)
        sw_set('raw' not in ARGV); report()
    else:
        tgt = proxy()
        for o in pieces:
            for nm in SW_NAMES:
                if nm in o.modifiers: o.modifiers[nm].show_viewport = False
        rest_state(); r0 = measure(); add_dqs(r0); reweight(r0)
        if 'snapw' in ARGV: snap_weights(r0)
        fix_rest()
        if 'diag' in ARGV: fix_poses(); ROUNDS = 0
        for r in range(ROUNDS):
            fix_keys(); fix_rest()
            if 'poses' in ARGV: fix_poses(); fix_rest()
        for o in pieces: shrinkwrap(o, tgt)
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
    arm.data.pose_position = 'POSE'
    if arm.animation_data: arm.animation_data.action = None
    restore_state()
if 'save' in ARGV and not REPORT:
    bpy.ops.wm.save_mainfile(); print('SAVED')
print('DONE', round(time.time() - t0))
if 'dbg' in ARGV:
    pass
