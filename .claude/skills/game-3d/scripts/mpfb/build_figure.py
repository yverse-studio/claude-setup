"""Build one MPFB2 figure headless: body, game_engine rig, CC0 clothes and hair, one texture atlas,
LOD chain by decimation, one GLB (all LODs, one skeleton, one texture). Usage:
python3.13 build_figure.py recipe.json outdir"""
import sys, os, json, math
import bpy, bmesh, addon_utils
from mathutils import Vector
from PIL import Image, ImageOps

R = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
NAME = R['name']
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
P = 'bl_ext.user_default.mpfb'
HumanService = __import__(P + '.services.humanservice', fromlist=['x']).HumanService
ExportService = __import__(P + '.services.exportservice', fromlist=['x']).ExportService
DATA = '/root/.config/blender/5.3/extensions/.user/user_default/mpfb/data'

def asset(kind, name):
    d = os.path.join(DATA, kind, name)
    for f in os.listdir(d):
        if f.endswith('.mhclo'): return os.path.join(d, f)
    raise FileNotFoundError(d)

def mhmat_info(path):
    info = {'dir': os.path.dirname(path)}
    for line in open(path, encoding='utf-8', errors='ignore'):
        p = line.split()
        if len(p) >= 2 and p[0] in ('diffuseTexture', 'normalmapTexture'): info[p[0]] = os.path.join(info['dir'], p[1])
        if len(p) >= 4 and p[0] == 'diffuseColor': info['diffuseColor'] = tuple(float(x) for x in p[1:4])
    return info

def mhclo_material(mhclo):
    for line in open(mhclo, encoding='utf-8', errors='ignore'):
        p = line.split()
        if len(p) >= 2 and p[0] == 'material': return os.path.join(os.path.dirname(mhclo), p[1])

# 1 body
macro = {'gender': R['gender'], 'age': R['age'], 'muscle': R.get('muscle', 0.5), 'weight': R.get('weight', 0.5),
         'height': R.get('height', 0.5), 'proportions': R.get('proportions', 0.5), 'cupsize': R.get('cupsize', 0.5),
         'firmness': R.get('firmness', 0.5), 'race': R['race']}
body = HumanService.create_human(macro_detail_dict=macro)
body.name = NAME + '_body'
# 2 rig (shared studio skeleton for every figure)
rig = HumanService.add_builtin_rig(body, 'game_engine'); rig.name = NAME + '_rig'
# 3 skin, parts, clothes (material per part recorded for the atlas)
parts = []
skin = os.path.join(DATA, 'skins', R['skin'], R['skin'] + '.mhmat')
HumanService.set_character_skin(skin, body, skin_type='GAMEENGINE')
parts.append((body, mhmat_info(skin), R.get('skin_tint', [1, 1, 1]), 'skin'))
def add(kind, name, tint=(1, 1, 1), atype=None, mat=None):
    f = asset(kind, name)
    o = HumanService.add_mhclo_asset(f, body, asset_type=atype or kind.capitalize(), subdiv_levels=0, material_type='GAMEENGINE')
    m = mat or mhclo_material(f)
    parts.append((o, mhmat_info(m), tint, kind + ':' + name))
    zd = [l.split()[1] for l in open(f, errors='ignore') if l.startswith('z_depth')]
    o['z_depth'] = (int(zd[0]) if zd else 50) * 100 + len(parts)  # recipe order breaks ties: later = outer
    return o
add('eyes', 'low-poly', atype='Eyes', mat=os.path.join(DATA, 'eyes', 'materials', R.get('eyes', 'brown') + '.mhmat'))
add('eyebrows', R.get('eyebrows', 'eyebrow001'), R.get('hair_tint', [1, 1, 1]))
add('eyelashes', R.get('eyelashes', 'eyelashes01'))
if R.get('hair'): add('hair', R['hair'], R.get('hair_tint', [1, 1, 1]))
for c in R['clothes']: add('clothes', c['name'], c.get('tint', [1, 1, 1]))

# 4 bake masks (body under clothes is deleted) and shape keys, drop helpers
ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, bake_subdiv=False, remove_helpers=True)
for o, *_ in parts:
    bpy.context.view_layer.objects.active = o
    if o.data.shape_keys:
        o.shape_key_add(name='mix', from_mix=True)
        for kb in list(o.data.shape_keys.key_blocks)[:-1]: o.shape_key_remove(kb)
        o.shape_key_remove(o.data.shape_keys.key_blocks[0])
    for m in list(o.modifiers):
        if m.type in ('MASK', 'SUBSURF'):
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
            bpy.ops.object.modifier_apply(modifier=m.name)

# 4b body faces hidden under clothes go (ray from each body vertex along its normal hits cloth within 4 cm)
from mathutils.bvhtree import BVHTree
dg = bpy.context.evaluated_depsgraph_get()
cloth = [o for o, i, t, l in parts if l.startswith('clothes:')]
trees = [BVHTree.FromObject(o, dg) for o in cloth]
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table(); bm.normal_update()
hidden = set()
for v in bm.verts:
    if any(t.ray_cast(v.co + v.normal * 0.001, v.normal, 0.04)[0] is not None for t in trees):
        hidden.add(v.index)
for _ in range(R.get('cull_margin', 0)):  # keep a margin of rings next to visible skin so decimated collars do not open
    hidden -= {w.index for v in bm.verts if v.index not in hidden for e in v.link_edges for w in e.verts}
kill = [f for f in bm.faces if all(v.index in hidden for v in f.verts)]
bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(body.data); bm.free()
print('HIDDEN body faces removed', len(kill))
# inner clothes under an outer layer: faces whose verts sit inside or within 1 cm of the outer piece go (stops poke-through)
cl = sorted([o for o in cloth if o['z_depth'] >= 1000], key=lambda o: o['z_depth'])  # garments only: shoes (z_depth 5) keep their shape
for k, inner in enumerate(cl):
    outers = [o for o in cl[k + 1:] if o['z_depth'] > inner['z_depth']]
    if not outers: continue
    ts = [BVHTree.FromObject(o, dg) for o in outers]
    bm = bmesh.new(); bm.from_mesh(inner.data); bm.verts.ensure_lookup_table(); bm.normal_update()
    # inner verts under the outer piece (covered, or within 12 mm of it) sink 12 mm below the outer surface: no waistband poke-through,
    # no hole (deleting them left dark gaps at the hem in gate round 1)
    moved = 0
    for v in bm.verts:
        for t in ts:
            near = t.find_nearest(v.co, 0.012)
            if t.ray_cast(v.co + v.normal * 0.001, v.normal, 0.03)[0] is not None or near[0] is not None:
                if near[0] is not None: v.co = near[0] - near[1] * 0.012
                else: v.co = v.co - v.normal * 0.006
                moved += 1; break
    bm.to_mesh(inner.data); bm.free()
    print('LAYER', inner.name, 'verts sunk under outer', moved)
for o, i, t, l in parts: print('PART', l, sum(len(p.vertices) - 2 for p in o.data.polygons))
# 5 atlas: each part's own 0..1 texture becomes one cell, UVs are moved into it (no bake, no resample of the UVs)
A = R.get('atlas', 2048)
cells = R.get('cells')  # list of [x,y,size] per part in order; default layout below
if not cells:
    h = A // 2; q = A // 4; e = A // 8
    cells = [[0, 0, h], [h + q + e, h + q, e], [h + q + e, h + q + e, e], [h + q, h + q + e, e]]  # skin, eyes, brows, lashes
    free = [[h, 0, h], [0, h, h], [h, h, q], [h + q, h, q], [h, h + q, q]]
    cells += free[:len(parts) - 4]
assert len(cells) >= len(parts), 'not enough atlas cells'
atlas = Image.new('RGBA', (A, A), (0, 0, 0, 0)); natlas = Image.new('RGB', (A, A), (128, 128, 255))
def tinted(img, tint):
    if tint == [1, 1, 1] or tuple(tint) == (1, 1, 1): return img
    r, g, b, a = img.split()
    r = r.point(lambda v: min(255, int(v * tint[0]))); g = g.point(lambda v: min(255, int(v * tint[1]))); b = b.point(lambda v: min(255, int(v * tint[2])))
    return Image.merge('RGBA', (r, g, b, a))
for (o, info, tint, label), (cx, cy, cs) in zip(parts, cells):
    if 'diffuseTexture' in info and os.path.exists(info['diffuseTexture']):
        img = Image.open(info['diffuseTexture']).convert('RGBA')
    else:
        c = info.get('diffuseColor', (0.8, 0.8, 0.8)); img = Image.new('RGBA', (8, 8), tuple(int(v * 255) for v in c) + (255,))
    img = tinted(img.resize((cs, cs), Image.LANCZOS), list(tint))
    atlas.paste(img, (cx, cy))
    if 'normalmapTexture' in info and os.path.exists(info['normalmapTexture']):
        natlas.paste(Image.open(info['normalmapTexture']).convert('RGB').resize((cs, cs), Image.LANCZOS), (cx, cy))
    uv = o.data.uv_layers.active.data; pad = 2 / A
    for l in uv:
        u, v = l.uv
        u = min(max(u - math.floor(u) if (u < 0 or u > 1) else u, 0), 1); v = min(max(v - math.floor(v) if (v < 0 or v > 1) else v, 0), 1)
        # PIL y goes down, UV v goes up
        l.uv = ((cx + pad * A + u * (cs - 2 * pad * A)) / A, 1 - (cy + pad * A + (1 - v) * (cs - 2 * pad * A)) / A)
    print('ATLAS', label, info.get('diffuseTexture', 'flat'), (cx, cy, cs))
# alpha: skin and cloth opaque, cards keep theirs; bleed colour into transparent texels so mips do not go dark
atlas_path = os.path.join(OUT, NAME + '_color.png'); natlas_path = os.path.join(OUT, NAME + '_normal.png')
rgb = atlas.convert('RGB'); al = atlas.split()[3]
bg = rgb.filter(__import__('PIL.ImageFilter', fromlist=['x']).BoxBlur(6))
out = Image.composite(rgb, bg, al.point(lambda v: 255 if v > 8 else 0)); out.putalpha(al)
out.save(atlas_path); natlas.save(natlas_path)

# 6 one material for every part
mat = bpy.data.materials.new(NAME + '_mat'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(atlas_path)
nt.links.new(ti.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(ti.outputs['Alpha'], bsdf.inputs['Alpha'])
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = bpy.data.images.load(natlas_path); tn.image.colorspace_settings.name = 'Non-Color'
nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Roughness'].default_value = 0.75
mat.surface_render_method = 'DITHERED'
bones = {b.name for b in rig.data.bones}
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
for o, *_ in parts:
    o.data.materials.clear(); o.data.materials.append(mat)
    for vg in list(o.vertex_groups):
        if vg.name not in bones: o.vertex_groups.remove(vg)
# 7 LODs: join first (shared borders collapse together: no gaps, no seams), then decimate with a protect group.
# protect weight: head and neck 1.0, hands 0.6; Decimate collapses weighted verts last.
targets = R.get('lods', [10000, 5000, 2000, 700])
bpy.ops.object.select_all(action='DESELECT')
for o, *_ in parts: o.select_set(True)
bpy.context.view_layer.objects.active = body; bpy.ops.object.join()
src = body; src.name = NAME + '_src'
# no weld: merging by distance tore eyelids and frayed garment edges (gate round 3)
pg = src.vertex_groups.new(name='protect')
idx = {g.name: g.index for g in src.vertex_groups}
want = {idx[n]: w for n, w in (('head', 1.0), ('neck_01', 1.0), ('hand_l', 0.6), ('hand_r', 0.6)) if n in idx}
for v in src.data.vertices:  # decimation weight: 1 = collapse freely, low = keep (head, neck, hands)
    w = max([want[g.group] * g.weight for g in v.groups if g.group in want] or [0])
    pg.add([v.index], 1.0 - 0.75 * min(1, w * 1.5), 'REPLACE')
lods = []
for i, t in enumerate(targets):
    o = src.copy(); o.data = src.data.copy(); bpy.context.collection.objects.link(o)
    o.modifiers.clear(); o.name = f'{NAME}_LOD{i}'; o.data.name = o.name
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    n = tris(o)
    if n > t:
        m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = t / n; m.use_collapse_triangulate = True
        m.vertex_group = 'protect'; m.vertex_group_factor = R.get('protect_factor', 1.0)
        bpy.ops.object.modifier_apply(modifier='dec')
    o.vertex_groups.remove(o.vertex_groups['protect'])
    am = o.modifiers.new('rig', 'ARMATURE'); am.object = rig
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    print(f'LOD{i} target {t} got {tris(o)}'); lods.append(o)
bpy.data.objects.remove(src)
parts = []
for o, *_ in parts: bpy.data.objects.remove(o)
if R.get('drop_lod0'):
    bpy.data.objects.remove(lods[0]); lods = lods[1:]
for o in lods: o.parent = rig
# 8 export: all LODs, one skeleton, one texture
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True)
for o in lods: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, NAME + '.glb'), use_selection=True, export_format='GLB',
    export_skins=True, export_all_influences=False, export_animations=False, export_morph=False,
    export_image_format='JPEG', export_jpeg_quality=90, export_yup=True, export_apply=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, NAME + '.blend'))
json.dump({'name': NAME, 'tris': {o.name: tris(o) for o in lods}, 'bones': len(rig.data.bones), 'height_m': round(max((rig.matrix_world @ Vector(c)).z for c in lods[0].bound_box), 3)},
          open(os.path.join(OUT, NAME + '.json'), 'w'), indent=1)
print('DONE', NAME)
