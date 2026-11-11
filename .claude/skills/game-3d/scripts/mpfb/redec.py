"""redec.py in.blend out.blend: rebuild LOD2 (2k) and LOD3 (700) from LOD1 in two decimate passes, body then head, so the head
(face plus hair) keeps HEADF (default 0.5) of the budget: far heads keep a round jaw. Keeps UVs, atlas material and skin weights."""
import bpy, sys, os
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SRC, OUT = a[0], a[1]
bpy.ops.wm.open_mainfile(filepath=SRC)
lods = {o.name[-4:]: o for o in bpy.data.objects if o.type == 'MESH' and '_LOD' in o.name}
near = lods['LOD1']; rig = near.parent
neck = (rig.matrix_world @ rig.data.bones['neck_01'].head_local).z
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def part(o, hd): return sum(len(p.vertices) - 2 for p in o.data.polygons if ((o.matrix_world @ p.center).z > neck) == hd)
HF = float(os.environ.get('HEADF', 0.5))  # share of the budget the head (face + hair) keeps
for nm, t in (('LOD2', 2000), ('LOD3', 700)):
    old = lods[nm]; name = old.name
    o = near.copy(); o.data = near.data.copy(); bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    for hd, tt in ((False, t * (1 - HF)), (True, t * HF)):
        g = o.vertex_groups.new(name='_dec')
        for v in o.data.vertices: g.add([v.index], 1.0 if ((o.matrix_world @ v.co).z > neck - 0.01) == hd else 0.0, 'REPLACE')
        for _ in range(14):
            if part(o, hd) <= tt * 1.03: break
            m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = max((tris(o) - (part(o, hd) - tt)) / tris(o), 0.3); m.vertex_group = '_dec'; m.use_collapse_triangulate = True
            bpy.ops.object.modifier_move_to_index(modifier='dec', index=0); bpy.ops.object.modifier_apply(modifier='dec')
        o.vertex_groups.remove(o.vertex_groups['_dec'])
    om = old.data; bpy.data.objects.remove(old); bpy.data.meshes.remove(om); o.name = name; o.data.name = name
    print('REDEC', name, tris(o), 'head', part(o, True), 'body', part(o, False))
bpy.ops.wm.save_as_mainfile(filepath=OUT)
