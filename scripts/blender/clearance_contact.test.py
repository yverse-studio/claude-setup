"""Regression test (2026-11-10, Saki outfits R2): (1) a garment whose name has no '_Cos_' (e.g. CL_knit-casual__dl_knit) crashed the fix
summary (IndexError in summarize); (2) `ignore_vg=<body group>` must report garment points that sit inside the body on that skin as
`contact` (never pushed), the rest stays `inside`. Tiny rig: sphere body r 0.1, garment sphere r 0.095 fully inside, body group `zone`
on the upper half.
  python3 clearance_contact.test.py <path/to/clearance.py>"""
import subprocess, sys, os, json, tempfile
CL = os.path.abspath(sys.argv[1]); D = tempfile.mkdtemp()
BUILD = r'''
import bpy, bmesh, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
ad = bpy.data.armatures.new('A'); arm = bpy.data.objects.new('Armature', ad); bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
with bpy.context.temp_override(active_object=arm, object=arm):
    bpy.ops.object.mode_set(mode='EDIT'); b = ad.edit_bones.new('Hips'); b.head = (0, 0, 0); b.tail = (0, 0, 0.1); bpy.ops.object.mode_set(mode='OBJECT')
def sphere(name, r):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=r); bm.to_mesh(me)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.parent = arm
    g = o.vertex_groups.new(name='Hips'); g.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    m = o.modifiers.new('Armature', 'ARMATURE'); m.object = arm; return o
body = sphere('T_Body', 0.1); body.vertex_groups.new(name='Twist_DQS'); body.shape_key_add(name='Basis')
z = body.vertex_groups.new(name='zone'); z.add([v.index for v in body.data.vertices if v.co.z > 0.01], 1.0, 'REPLACE')
body.data.shape_keys.animation_data_create(); body.animation_data_create()
g = sphere('U_Shell', 0.095); g.shape_key_add(name='Basis'); g.shape_key_add(name='CH_t').value = 1.0
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[-1])
'''
RUN = 'import sys,bpy,runpy\nbpy.ops.wm.open_mainfile(filepath=sys.argv[1]); s=sys.argv[2]; sys.argv=["blender","--",*sys.argv[3:]]; runpy.run_path(s, run_name="__main__")\n'
open(os.path.join(D, 'b.py'), 'w').write(BUILD); open(os.path.join(D, 'r.py'), 'w').write(RUN)
blend = os.path.join(D, 't.blend'); subprocess.run([sys.executable, os.path.join(D, 'b.py'), blend], check=True, capture_output=True)
common = ['body=T_Body', 'prefix=U_', 'hair=T_Hair', 'mask=none', 'pieces=Shell', 'poses=none']
rep = lambda extra: subprocess.run([sys.executable, os.path.join(D, 'r.py'), blend, CL, *common, 'nokeyrep', 'report=' + os.path.join(D, 'r.json'), *extra], capture_output=True, text=True)
p = rep(['ignore_vg=zone']); assert p.returncode == 0, p.stderr[-2000:]
row = json.load(open(os.path.join(D, 'r.json')))['rest']['U_Shell']
assert row.get('contact', 0) > 0 and 0 < row['inside'] < row['n'], ('ignore_vg must split contact from inside', row)
fx = subprocess.run([sys.executable, os.path.join(D, 'r.py'), blend, CL, *common, 'rounds=0', 'into=CH_t'], capture_output=True, text=True)
assert fx.returncode == 0 and 'IndexError' not in fx.stderr, 'fix summary crashed on a name without _Cos_:\n' + fx.stderr[-1500:]
print('PASS', row)
