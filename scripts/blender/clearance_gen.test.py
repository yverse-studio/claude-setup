"""Regression test (2026-11-09): clearance.py fix mode on a garment whose stack starts with a Subsurf (Saki's DL_* pieces)
crashed (IndexError in fold / KeyError FACE_SRC). Builds a tiny rig: a sphere body and a smaller sphere garment inside it
(Subsurf first, then Armature), runs the fix with `faces into=CH_t`, and checks: no crash, the garment clears the body at rest
in the file state (report), and only the CH_t key moved (Basis untouched).
  python3 test_clearance_gen.py <path/to/clearance.py>"""
import subprocess, sys, os, json, tempfile
CL = os.path.abspath(sys.argv[1]); D = tempfile.mkdtemp()
BUILD = r'''
import bpy, bmesh
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
body = sphere('T_Body', 0.1); body.vertex_groups.new(name='Twist_DQS'); body.shape_key_add(name='Basis'); body.shape_key_add(name='Slider')
body.data.shape_keys.animation_data_create(); body.animation_data_create()
g = sphere('T_Cos_Shell', 0.095); g.modifiers.new('FIT_SUB', 'SUBSURF').levels = 1; g.modifiers.move(1, 0)
g.shape_key_add(name='Basis'); g.shape_key_add(name='CH_t').value = 1.0
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[-1])
'''
RUN = 'import sys,bpy,runpy\nbpy.ops.wm.open_mainfile(filepath=sys.argv[1]); s=sys.argv[2]; sys.argv=["blender","--",*sys.argv[3:]]; runpy.run_path(s, run_name="__main__")\n'
open(os.path.join(D, 'b.py'), 'w').write('import sys\n' + BUILD); open(os.path.join(D, 'r.py'), 'w').write(RUN)
blend = os.path.join(D, 't.blend'); subprocess.run([sys.executable, os.path.join(D, 'b.py'), blend], check=True, capture_output=True)
common = ['body=T_Body', 'prefix=T_Cos_', 'hair=T_Hair', 'mask=none', 'pieces=Shell', 'poses=none', 'faces']
fx = subprocess.run([sys.executable, os.path.join(D, 'r.py'), blend, CL, *common, 'rounds=0', 'into=CH_t', 'smooth=20', 'save'], capture_output=True, text=True)
assert fx.returncode == 0 and 'SAVED' in fx.stdout, 'fix crashed:\n' + fx.stdout[-1500:] + fx.stderr[-2500:]
rep = os.path.join(D, 'r.json')
rp = subprocess.run([sys.executable, os.path.join(D, 'r.py'), blend, CL, *common, 'report=' + rep], capture_output=True, text=True)
assert rp.returncode == 0, rp.stderr[-2000:]
row = json.load(open(rep))['rest']['Shell']; assert row['min_mm'] >= 0 and row['inside'] == 0, row
chk = 'import bpy,sys,numpy as np\nbpy.ops.wm.open_mainfile(filepath=sys.argv[1]); k=bpy.data.objects["T_Cos_Shell"].data.shape_keys.key_blocks\n' \
      'a=np.array([v.co.length for v in k["Basis"].data]); b=np.array([v.co.length for v in k["CH_t"].data]); print("BASIS", round(a.max(),4), "CH", round(b.min(),4))'
open(os.path.join(D, 'c.py'), 'w').write(chk); out = subprocess.run([sys.executable, os.path.join(D, 'c.py'), blend], capture_output=True, text=True).stdout
basis = float(out.split('BASIS ')[1].split()[0]); ch = float(out.split('CH ')[1].split()[0])
assert abs(basis - 0.095) < 1e-3 and ch > 0.1, out
print('PASS', row, out.strip())
