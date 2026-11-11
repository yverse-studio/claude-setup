"""Character = base + delta (claude-setup docs/base-delta.md). One tool, four jobs, run inside Blender:

  extract  blender -b <character>.blend --factory-startup -P delta.py -- extract <char> <delta.json> [base=<base.blend>]
           Reads what the character adds to the base: proportion scale, key values, own key/material/object lists,
           and the drift (places where the character's geometry is not base x scale: stale base, hand edits).
  sync     blender -b <copy of character>.blend --factory-startup -P delta.py -- sync <char> <delta.json> <out.blend> [base=..]
           Re-applies the CURRENT base onto the character file: rig rest pose, body/face/hair shape keys and weights,
           identity key CH_<char>, key values from the delta. Outfits, looks, actions, materials stay (dress.py after).
  dump     blender -b <any>.blend --factory-startup -P delta.py -- dump <out.npz>
           Fingerprint (bones, every shape key, weight hashes, key values, object scales) for delta_verify.py.
  marker   blender -b <base copy>.blend --factory-startup -P delta.py -- marker <out.blend>
           Writes a test base: one body vertex +1 mm in every key and one bone +1 mm (proof that a base edit arrives).

Rules it enforces: object and armature scale stay 1; the proportion lives in the key CH_<char> (value 1, = basis x k - basis)
and in the bone rest pose (x k); the base file is only read, never written."""
import bpy, sys, os, json, hashlib
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import paths  # STUDIO_ROOT + config/paths.json
import numpy as np
from mathutils import Vector

LIB = paths.path('lib')
BASE_DEFAULT = os.path.join(LIB, 'characters', 'CH_Base', 'female', 'Blend', 'base_female_v4.blend')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OPT = {a.split('=', 1)[0]: a.split('=', 1)[1] for a in ARGS if '=' in a}
POS = [a for a in ARGS if '=' not in a]
BASE_PATH = os.path.abspath(OPT.get('base', BASE_DEFAULT))
DRIFT_MM = 0.5


def cfg(char):
    return json.load(open(paths.path('tools_laptop', 'clothes_items.json'), encoding='utf-8'))['characters'][char]


def arr(data, n):
    a = np.empty(n * 3, np.float32); data.foreach_get('co', a); return a.reshape(-1, 3)


def put(data, a):
    data.foreach_set('co', np.ascontiguousarray(a, np.float32).ravel())


def md5(a):
    return hashlib.md5(np.ascontiguousarray(a)).hexdigest()


# ---------------------------------------------------------------- roles

def is_outfit(o):
    return '_Cos_' in o.name or o.name.endswith('FitBody')


def roles(prefix_hint=None):
    """armature, body, face, hair{suffix: obj} of the open file (works for the base and for characters)."""
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and len(o.data.bones) > 200)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not is_outfit(o)]
    body = next(o for o in meshes if o.name.endswith('_Body') and o.parent == arm)
    face = bpy.data.objects.get('Face')
    hair = {o.name.split('_Hair_', 1)[1]: o for o in meshes if '_Hair_' in o.name}
    return dict(arm=arm, body=body, face=face, hair=hair, prefix=body.name[:-len('_Body')])


def base_roles():
    """Append the base objects (read only) into the open file; returns roles of the appended copies + a cleanup()."""
    before = {c: set(i.name for i in getattr(bpy.data, c)) for c in ('objects', 'meshes', 'armatures', 'materials', 'images', 'node_groups', 'shape_keys', 'actions')}
    with bpy.data.libraries.load(BASE_PATH, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in ('Armature', 'Rika_Body', 'Face') or n.startswith('Rika_Hair_')]
    objs = [o for o in dst.objects if o]
    # the base objects sit under the name of the base; the open file may already hold the same names -> they got .001
    arm = next(o for o in objs if o.type == 'ARMATURE')
    body = next(o for o in objs if o.type == 'MESH' and o.name.startswith('Rika_Body'))
    face = next((o for o in objs if o.type == 'MESH' and o.name.startswith('Face')), None)
    hair = {o.name.split('_Hair_', 1)[1].split('.0')[0]: o for o in objs if o.type == 'MESH' and '_Hair_' in o.name}

    def cleanup():
        for o in objs: bpy.data.objects.remove(o)
        for c in ('meshes', 'armatures', 'materials', 'images', 'node_groups', 'shape_keys', 'actions'):
            for i in [i for i in getattr(bpy.data, c) if i.name not in before[c] and i.users == 0]:
                getattr(bpy.data, c).remove(i)
        # appended materials/images that mesh removal left with zero users are gone; the rest belongs to the open file
    return dict(arm=arm, body=body, face=face, hair=hair, objs=objs), cleanup


def edit_bones(arm_obj):
    """name -> dict(head, tail, roll, parent, connect, deform) read in edit mode."""
    out = {}
    coll = bpy.context.scene.collection
    linked = arm_obj.name not in coll.all_objects
    if linked: coll.objects.link(arm_obj)
    vl = bpy.context.view_layer; vl.update()
    prev = vl.objects.active
    arm_obj.hide_set(False); arm_obj.hide_viewport = False
    for o in vl.objects: o.select_set(False)
    arm_obj.select_set(True); vl.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    for b in arm_obj.data.edit_bones:
        out[b.name] = dict(head=tuple(b.head), tail=tuple(b.tail), roll=b.roll, parent=b.parent.name if b.parent else '',
                           connect=b.use_connect, deform=b.use_deform)
    bpy.ops.object.mode_set(mode='OBJECT')
    if linked: coll.objects.unlink(arm_obj)
    if prev: vl.objects.active = prev
    return out


# ---------------------------------------------------------------- proportion

def estimate_scale(char_bones, base_bones):
    r = []
    for n, b in base_bones.items():
        c = char_bones.get(n)
        if not c: continue
        bh, ch = np.array(b['head']), np.array(c['head'])
        if np.linalg.norm(bh) > 0.3: r.append(np.linalg.norm(ch) / np.linalg.norm(bh))
    r = np.array(r)
    return float(np.median(r)), float(r.std())


def keymeta(kb):
    return dict(rel=kb.relative_key.name, mn=kb.slider_min, mx=kb.slider_max, vg=kb.vertex_group, interp=kb.interpolation, mute=kb.mute)


# ---------------------------------------------------------------- extract

def mat_hash(m):
    if not m or not m.node_tree: return None
    rows = []
    for n in sorted(m.node_tree.nodes, key=lambda n: n.name):
        row = [n.type]
        for i in n.inputs:
            v = getattr(i, 'default_value', None)
            try: row.append([round(x, 4) for x in v])
            except TypeError:
                row.append(round(v, 4) if isinstance(v, (int, float)) else None)
        if n.type == 'TEX_IMAGE' and n.image: row.append(n.image.name)
        rows.append(row)
    return hashlib.md5(json.dumps(rows, default=str).encode()).hexdigest()[:12]


def extract(char, out):
    R = roles(); B, cleanup = base_roles()
    cb, bb = edit_bones(R['arm']), edit_bones(B['arm'])
    k, sd = estimate_scale(cb, bb)
    resid = sorted(((float(np.abs(np.array(cb[n]['head'] + cb[n]['tail']) - np.array(bb[n]['head'] + bb[n]['tail']) * k).max() * 1000), n)
                    for n in bb if n in cb), reverse=True)
    D = dict(schema=1, character=char, base='base_female_v4', body=R['body'].name, prefix=R['prefix'],
             proportion=dict(kind='uniform', scale=round(k, 5), anchor=[0, 0, 0], std=round(sd, 6)),
             bones=dict(only_base=sorted(set(bb) - set(cb)), only_char=sorted(set(cb) - set(bb)),
                        residual_mm=[[n, round(v, 2)] for v, n in resid if v > 0.2][:40]),
             keys={}, own_keys={}, drift={}, materials={}, arm_props={})
    for a, v in R['arm'].items():
        if isinstance(v, (int, float, str)): D['arm_props'][a] = v
    pairs = [('body', R['body'], B['body']), ('face', R['face'], B['face'])] + \
            [(f'hair:{s}', o, B['hair'].get(s)) for s, o in sorted(R['hair'].items())]
    for role, o, bo in pairs:
        if not o or not bo: continue
        me, bme = o.data, bo.data
        ck = me.shape_keys.key_blocks if me.shape_keys else None
        bk = bme.shape_keys.key_blocks if bme.shape_keys else None
        if ck: D['keys'][role] = {x.name: round(x.value, 4) for x in ck[1:] if abs(x.value) > 1e-6 and not x.name.startswith('CH_')}
        if ck and bk: D['own_keys'][role] = sorted(x.name for x in ck if x.name not in bk and not x.name.startswith('CH_'))
        same = len(me.vertices) == len(bme.vertices)
        info = dict(verts=len(me.vertices), base_verts=len(bme.vertices), same_topology=same)
        if same and ck and bk:
            cbasis, bbasis = arr(ck[0].data, len(me.vertices)), arr(bk[0].data, len(bme.vertices))
            ident = ck.get('CH_' + char)
            if ident and ident.value > 0: cbasis = cbasis + (arr(ident.data, len(me.vertices)) - cbasis) * ident.value   # the proportion lives in the key
            d = np.abs(cbasis - bbasis * k).max(1) * 1000
            info.update(max_mm=round(float(d.max()), 2), p99_mm=round(float(np.percentile(d, 99)), 2), over=int((d > DRIFT_MM).sum()))
        elif not same:
            info['note'] = 'own topology: the sync swaps in the current base mesh'
        D['drift'][role] = info
    for slot_obj in [R['body'], R['face']] + list(R['hair'].values()):
        for s in slot_obj.material_slots:
            m = s.material
            if m: D['materials'][m.name] = mat_hash(m)
    for s in [s for o in [B['body'], B['face']] + list(B['hair'].values()) for s in o.material_slots]:
        m = s.material
        if m:
            suffix = m.name.split('_', 1)[1].split('.0')[0]
            mine = next((x for x in D['materials'] if x.split('_', 1)[-1] == suffix), None)
            if mine: D['materials'][mine] = dict(hash=D['materials'][mine], differs_from_base=D['materials'][mine] != mat_hash(m))
    cleanup()
    json.dump(D, open(out, 'w'), indent=1)
    print('EXTRACT', char, 'scale', D['proportion'], 'residual bones', len(D['bones']['residual_mm']), 'drift', {r: i.get('over', 'topo') for r, i in D['drift'].items()})


# ---------------------------------------------------------------- sync

def ensure_key(o, name):
    me = o.data
    if not me.shape_keys: o.shape_key_add(name='Basis', from_mix=False)
    kb = me.shape_keys.key_blocks
    return kb.get(name) or o.shape_key_add(name=name, from_mix=False)


def ck_names(o):
    return {x.name for x in o.data.shape_keys.key_blocks} if o.data.shape_keys else set()


def sync_weights(o, bo):
    """Base weights onto the object for every group of the base (extra groups of the character stay)."""
    me, bme = o.data, bo.data
    gi = {g.index: g.name for g in bo.vertex_groups}
    want = {}
    for v in bme.vertices:
        for g in v.groups: want[(v.index, gi[g.group])] = g.weight
    have_names = {g.name: g for g in o.vertex_groups}
    for g in bo.vertex_groups:
        if g.name not in have_names: have_names[g.name] = o.vertex_groups.new(name=g.name)
    ci = {g.index: g.name for g in o.vertex_groups}
    have = {}
    for v in me.vertices:
        for g in v.groups:
            if ci[g.group] in {x.name for x in bo.vertex_groups}: have[(v.index, ci[g.group])] = g.weight
    changed = 0
    for key, w in want.items():
        if abs(have.get(key, -1) - w) > 1e-6:
            have_names[key[1]].add([key[0]], w, 'REPLACE'); changed += 1
    for key in have:
        if key not in want: have_names[key[1]].remove([key[0]]); changed += 1
    return changed


def sync_mesh(o, bo, k, ident, values, morph=None):
    me, bme = o.data, bo.data
    rep = {}
    if len(me.vertices) != len(bme.vertices):   # own topology (old base): swap in the current base mesh, keep slots and values
        old_vals = {x.name: x.value for x in me.shape_keys.key_blocks} if me.shape_keys else {}
        mats = [m for m in me.materials]
        new = bme.copy(); new.name = me.name
        for g in list(o.vertex_groups): o.vertex_groups.remove(g)
        o.data = new
        for g in bo.vertex_groups: o.vertex_groups.new(name=g.name)
        new.materials.clear()
        for m in mats: new.materials.append(m)
        me = new; rep['swapped_mesh'] = True
        for kb in me.shape_keys.key_blocks:
            if kb.name in old_vals: kb.value = old_vals[kb.name]
    n = len(me.vertices)
    ck_all = me.shape_keys.key_blocks if me.shape_keys else None
    bk = bme.shape_keys.key_blocks if bme.shape_keys else None
    basis_b = arr(bk[0].data, n) if bk else np.array([v.co[:] for v in bme.vertices], np.float32)
    if not o.data.shape_keys: o.shape_key_add(name='Basis', from_mix=False)
    put(o.data.shape_keys.key_blocks[0].data, basis_b)
    fresh = [x.name for x in bk or [] if x.name not in ck_names(o)]
    for kb_b in (bk or []):
        kb = ensure_key(o, kb_b.name)
        put(kb.data, arr(kb_b.data, n))
    ck = me.shape_keys.key_blocks
    for kb_b in (bk or []):   # relations after all keys exist
        kb = ck[kb_b.name]; m = keymeta(kb_b)
        kb.relative_key = ck[m['rel']] if m['rel'] in ck else ck[0]
        kb.slider_min, kb.slider_max, kb.interpolation, kb.mute = m['mn'], m['mx'], m['interp'], m['mute']
        kb.vertex_group = m['vg'] if m['vg'] in o.vertex_groups or not m['vg'] else ''
    for x in fresh: ck[x].value = bk[x].value     # a key new in the base arrives at the base's value; existing keys keep the character's
    ik = ensure_key(o, ident)                       # identity key: the proportion, basis x k, value 1
    put(ik.data, basis_b * k)
    ik.relative_key = ck[0]; ik.slider_min, ik.slider_max = 0.0, 1.0; ik.value = 1.0
    if morph is not None and len(morph) == n:                  # own per-vertex morph (delta_migrate.py), the character's own key
        mk = ensure_key(o, ident + '_own'); put(mk.data, basis_b + morph)
        mk.relative_key = ck[0]; mk.slider_min, mk.slider_max = 0.0, 1.0; mk.value = 1.0
    for kb in ck:
        if kb.name.startswith('CH_') and kb.name != ident and kb.name != ident + '_own':
            kb.value = 0.0
    me.vertices.foreach_set('co', basis_b.ravel()); me.update()          # mesh co = Basis (the 6.8 mm trap)
    for name, v in values.items():
        if name in ck: ck[name].value = v
    rep['weights'] = sync_weights(o, bo)
    return rep


def sync_rig(arm_obj, base_bones, k, base_h):
    coll_cleanup = None
    vl = bpy.context.view_layer
    arm_obj.hide_set(False); arm_obj.hide_viewport = False
    for o in vl.objects: o.select_set(False)
    arm_obj.select_set(True); vl.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_obj.data.edit_bones
    added = []
    for n, b in base_bones.items():
        e = eb.get(n)
        if not e: e = eb.new(n); added.append(n)
        e.use_connect = False
    for n, b in base_bones.items():
        e = eb[n]
        e.head = Vector(b['head']) * k; e.tail = Vector(b['tail']) * k; e.roll = b['roll']
    for n, b in base_bones.items():
        e = eb[n]
        e.parent = eb[b['parent']] if b['parent'] else None
        e.use_connect = b['connect']
        if n in added: e.use_deform = b['deform']
    bpy.ops.object.mode_set(mode='OBJECT')
    arm_obj['height_m'] = round(base_h * k, 4)
    return added


def sync(char, dpath, out):
    D = json.load(open(dpath)); k = D['proportion']['scale']
    R = roles(); B, cleanup = base_roles()
    ident = cfg(char)['key']
    bb = edit_bones(B['arm'])
    base_h = float(B['arm'].get('height_m', 1.65))
    rep = dict(character=char, scale=k)
    rep['bones_added'] = sync_rig(R['arm'], bb, k, base_h)
    morph = np.load(os.path.join(os.path.dirname(dpath), D['own_morph'])) if D.get('own_morph') else {}
    mo = lambda role: morph[f'{role}|morph'] if f'{role}|morph' in morph else None
    rep['body'] = sync_mesh(R['body'], B['body'], k, ident, D['keys'].get('body', {}), mo('body'))
    if R['face'] and B['face']: rep['face'] = sync_mesh(R['face'], B['face'], k, ident, D['keys'].get('face', {}), mo('face'))
    for s, o in R['hair'].items():
        if s in B['hair']: rep[f'hair:{s}'] = sync_mesh(o, B['hair'][s], k, ident, D['keys'].get(f'hair:{s}', {}), mo(f'hair:{s}'))
    for a, v in D.get('arm_props', {}).items():
        if a not in ('height_m', 'scale_from_v4n'): R['arm'][a] = v
    R['arm']['base_id'] = D['base']
    cleanup()
    for o in bpy.data.objects:
        if o.type in ('ARMATURE', 'MESH') and tuple(round(s, 6) for s in o.scale) != (1, 1, 1): rep.setdefault('scale_not_1', []).append(o.name)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print('SYNC', json.dumps(rep, default=str)[:1500], 'SAVED', out)


# ---------------------------------------------------------------- dump / marker

def weights(o):
    """(names, rows[vi, group index, weight]) of all vertex weights."""
    names = [g.name for g in o.vertex_groups]
    rows = [(v.index, g.group, g.weight) for v in o.data.vertices for g in v.groups]
    return names, np.array(rows, np.float32).reshape(-1, 3)


def dump(out):
    R = roles(); data = {}; meta = dict(scale={}, values={}, weights={}, rel={})
    for o in bpy.data.objects:
        if o.type in ('ARMATURE', 'MESH') and not is_outfit(o): meta['scale'][o.name] = [round(s, 6) for s in o.scale]
    eb = edit_bones(R['arm']); meta['bones'] = eb
    meta['height_m'] = R['arm'].get('height_m')
    items = [('body', R['body']), ('face', R['face'])] + [(f'hair:{s}', o) for s, o in sorted(R['hair'].items())]
    for role, o in items:
        if not o: continue
        me = o.data; n = len(me.vertices)
        data[f'{role}|co'] = np.array([v.co[:] for v in me.vertices], np.float32)
        meta.setdefault('nverts', {})[role] = n
        data[f'{role}|Basis'] = data[f'{role}|co']
        names, rows = weights(o); meta['weights'][role] = names; data[f'{role}|W'] = rows
        if me.shape_keys:
            meta['values'][role] = {k.name: round(k.value, 5) for k in me.shape_keys.key_blocks}
            meta['rel'][role] = {k.name: k.relative_key.name for k in me.shape_keys.key_blocks}
            for k in me.shape_keys.key_blocks: data[f'{role}|{k.name}'] = arr(k.data, n)
    np.savez_compressed(out, **data)
    json.dump(meta, open(out + '.json', 'w'))
    print('DUMP', out, len(data))


def marker(out):
    R = roles(); body = R['body']; me = body.data
    kb = me.shape_keys.key_blocks; vi = 5000
    for k in kb:
        if k.name == 'Basis' or k.relative_key.name == 'Basis':
            c = k.data[vi].co.copy(); k.data[vi].co = c + Vector((0.001, 0, 0))
    me.vertices[vi].co = kb[0].data[vi].co
    eb = edit_bones(R['arm'])
    arm = R['arm']; bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT'); e = arm.data.edit_bones['Head']; e.tail = e.tail + Vector((0.001, 0, 0))
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print('MARKER', out, 'vertex', vi, 'bone Head tail +1 mm x')


if POS:
    cmd = POS[0]
    if cmd == 'extract': extract(POS[1], POS[2])
    elif cmd == 'sync': sync(POS[1], POS[2], POS[3])
    elif cmd == 'dump': dump(POS[1])
    elif cmd == 'marker': marker(POS[1])
