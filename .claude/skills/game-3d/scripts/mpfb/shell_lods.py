"""Replace the far LODs (2k, 700) of a built figure with closed shells: solidify + voxel remesh of the nearest LOD (closed, so no
slits, mouth holes or hair gaps can open), decimate, smart UV, colour baked from the near LOD, weights transferred.
Usage: python3.13 shell_lods.py in.blend outdir [voxel_m] [tex2k] [tex700]"""
import sys, os, json, bpy, bmesh
from mathutils import Vector
a = sys.argv[1:]; SRC, OUT = a[0], a[1]; VOX = float(a[2]) if len(a) > 2 else 0.006
TEX = {2000: int(a[3]) if len(a) > 3 else 512, 700: int(a[4]) if len(a) > 4 else 256}
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=SRC)
NAME = os.path.basename(SRC)[:-6]
rig = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and '_LOD' in o.name], key=lambda o: o.name)
near = lods[0]
far = [o for o in lods if o.name.endswith(('_LOD2', '_LOD3'))]
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 4
def sel(*objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]
def uv_overlaps(me, R=512):
    import numpy as np
    uv = me.uv_layers.active.data; me.calc_loop_triangles(); own = -np.ones((R, R), int); bad = set()
    for t in me.loop_triangles:
        P = np.array([uv[l].uv[:] for l in t.loops]) * R; a, b, c = P
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9: continue
        x0, y0 = np.floor(P.min(0)).astype(int); x1, y1 = np.ceil(P.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, R)) + .5, np.arange(max(y0, 0), min(y1, R)) + .5)
        w1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d; w2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        m = (w1 > 0.02) & (w2 > 0.02) & (1 - w1 - w2 > 0.02); iy = (ys[m] - .5).astype(int); ix = (xs[m] - .5).astype(int)
        prev = {int(p) for p in own[iy, ix] if p >= 0 and p != t.polygon_index}
        if prev: bad |= prev; bad.add(t.polygon_index)
        own[iy, ix] = t.polygon_index
    return bad
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
# bake source: the near LOD without faces that sit under another layer (a white sock under the trouser hem baked through as
# white shards, round 11). HIDDEN = how close the outer layer must be (m), HIDZ = only below this height (m).
src = near
HID = float(os.environ.get('HIDDEN', 0))
if HID:
    from mathutils.bvhtree import BVHTree
    src = near.copy(); src.data = near.data.copy(); bpy.context.collection.objects.link(src); src.name = near.name + '_bakesrc'
    src.modifiers.clear(); src.parent = None; src.matrix_world = near.matrix_world.copy()
    bvh = BVHTree.FromObject(src, bpy.context.evaluated_depsgraph_get(), deform=False); mw = src.matrix_world; hz = float(os.environ.get('HIDZ', 0.6))
    bm = bmesh.new(); bm.from_mesh(src.data); bm.faces.ensure_lookup_table(); kill = []
    for f in bm.faces:
        c = mw @ f.calc_center_median(); n = (mw.to_3x3() @ f.normal).normalized()
        if c.z > hz: continue
        loc, nrm, i, d = bvh.ray_cast(c + n * 1e-4, n, HID)
        if loc is not None and i != f.index: kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(src.data); bm.free(); src.hide_render = True
    print('HIDDEN faces removed from bake source', len(kill))
for old in far:
    t = 2000 if old.name.endswith('_LOD2') else 700
    for vox in (VOX, VOX * 1.4, VOX * 2, VOX * 3):  # tunnels (genus) stop decimation; a coarser voxel closes them
        sh = near.copy(); sh.data = near.data.copy(); bpy.context.collection.objects.link(sh); sh.name = old.name + '_shell'
        sh.modifiers.clear(); sh.vertex_groups.clear(); sh.parent = None; sh.matrix_world = near.matrix_world.copy()
        sel(sh)
        m = sh.modifiers.new('sol', 'SOLIDIFY'); m.thickness = vox * 0.8; m.offset = 0; bpy.ops.object.modifier_apply(modifier='sol')
        m = sh.modifiers.new('vox', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = vox; m.adaptivity = 0; bpy.ops.object.modifier_apply(modifier='vox'); print('after remesh', tris(sh), len(sh.data.vertices))
        # keep the biggest piece only (stray voxel islands from lashes or shoe laces)
        bm = bmesh.new(); bm.from_mesh(sh.data); bm.verts.ensure_lookup_table()
        seen = set(); parts = []
        for v in bm.verts:
            if v in seen: continue
            st = [v]; comp = []
            seen.add(v)
            while st:
                x = st.pop(); comp.append(x)
                for e in x.link_edges:
                    y = e.other_vert(x)
                    if y not in seen: seen.add(y); st.append(y)
            parts.append(comp)
        parts.sort(key=len, reverse=True)
        print('components', [len(p) for p in parts[:12]], len(parts))
        small = [v for p in parts[1:] if len(p) < 0.02 * len(parts[0]) for v in p]
        bmesh.ops.delete(bm, geom=small, context='VERTS'); bm.to_mesh(sh.data); bm.free()
        print('after islands', tris(sh))
        for _ in range(8):  # one big collapse stalls (stuck near 17k from 320k); several smaller ones reach the target
            if tris(sh) <= t * 1.02: break
            m = sh.modifiers.new('dec', 'DECIMATE'); m.ratio = max(t / tris(sh), 0.25); m.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier='dec'); print('  dec step', tris(sh), len(sh.data.vertices))
        print('after dec', tris(sh))
        if tris(sh) <= t * 1.05: break
        bpy.data.objects.remove(sh)
    print('voxel used', vox)
    bm2 = bmesh.new(); bm2.from_mesh(sh.data); bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces[:]); bm2.to_mesh(sh.data); bm2.free()  # decimation flips a few faces: dark shards
    snap = float(os.environ.get('SNAP', 0))  # shards: shell vertices standing out more than this from the near LOD go back onto it
    if snap:
        from mathutils.bvhtree import BVHTree
        dg = bpy.context.evaluated_depsgraph_get(); nb = BVHTree.FromObject(near, dg, deform=False); ns = 0
        mw = sh.matrix_world; inv = mw.inverted()
        for v in sh.data.vertices:
            p = mw @ v.co; loc, nrm, i, d = nb.find_nearest(p)
            if loc is not None and d > snap and (p - loc).dot(nrm) > 0: v.co = inv @ (loc + nrm * 0.002); ns += 1
        print('SNAP verts', ns)
    for u in list(sh.data.uv_layers): sh.data.uv_layers.remove(u)
    sh.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=float(os.environ.get('UVANG', 1.15)), island_margin=0.01); bpy.ops.object.mode_set(mode='OBJECT')
    # smart UV can fold an island over itself at the shoe and hem; both faces then bake into the same texels (round 12: the
    # white shoe printed onto the trouser hem). Give the overlapping faces their own islands and repack everything.
    for it in range(4):
        ov = uv_overlaps(sh.data); print('UV overlap faces', len(ov))
        if not ov: break
        bm3 = bmesh.new(); bm3.from_mesh(sh.data); bm3.faces.ensure_lookup_table()
        for f in bm3.faces: f.select = f.index in ov
        bm3.to_mesh(sh.data); bm3.free(); sc.tool_settings.use_uv_select_sync = True
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.smart_project(angle_limit=0.2, island_margin=0.01)
        bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.pack_islands(margin=0.01); bpy.ops.object.mode_set(mode='OBJECT')
    # bake colour from the near LOD
    img = bpy.data.images.new(old.name + '_bake', TEX[t], TEX[t]); img.generated_color = (1, 0, 1, 1); mat = bpy.data.materials.new(old.name + '_mat'); mat.use_nodes = True
    nt = mat.node_tree; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
    nt.links.new(tn.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color']); nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.75
    nt.nodes.active = tn; sh.data.materials.clear(); sh.data.materials.append(mat)
    src.hide_render = False; sel(src, sh, active=sh)
    sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = float(os.environ.get('CAGE', 0.03)); sc.render.bake.max_ray_distance = float(os.environ.get('RAY', 0.08))
    sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False; sc.render.bake.margin = 4
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    # rays that miss leave the magenta sentinel (round 8: black triangles); grow real colour into them
    import numpy as np
    a = np.array(img.pixels[:], dtype=np.float32).reshape(TEX[t], TEX[t], 4)
    miss = (a[..., 0] > 0.99) & (a[..., 1] < 0.01) & (a[..., 2] > 0.99); print('BAKE misses', int(miss.sum()))
    for _ in range(64):
        if not miss.any(): break
        acc = np.zeros_like(a[..., :3]); n = np.zeros(miss.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ok = np.roll(~miss, (dy, dx), (0, 1)); acc += np.where(ok[..., None], np.roll(a[..., :3], (dy, dx), (0, 1)), 0); n += ok
        fill = miss & (n > 0); a[fill, :3] = acc[fill] / n[fill][:, None]; miss &= ~fill
    img.pixels[:] = a.ravel().tolist()
    img.filepath_raw = os.path.join(OUT, old.name + '_bake.png'); img.file_format = 'PNG'; img.save()
    img.pack()
    # weights from the near LOD
    sel(sh)
    dt = sh.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = near; dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'POLYINTERP_NEAREST'; dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.datalayout_transfer(modifier='dt'); bpy.ops.object.modifier_apply(modifier='dt')
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    am = sh.modifiers.new('rig', 'ARMATURE'); am.object = rig
    nm = old.name; bpy.data.objects.remove(old); sh.name = nm; sh.data.name = nm; sh.parent = rig
    bpy.ops.object.shade_smooth()
    print('SHELL', nm, tris(sh))
if src is not near: bpy.data.objects.remove(src)
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and '_LOD' in o.name], key=lambda o: o.name)
sel(rig, *lods, active=rig)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, NAME + '.glb'), use_selection=True, export_format='GLB',
    export_skins=True, export_all_influences=False, export_animations=False, export_morph=False,
    export_image_format='JPEG', export_jpeg_quality=90, export_yup=True, export_apply=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, NAME + '.blend'))
print('DONE', NAME)
