"""Regression test (2026-11-10, neighbour knit): the ClearanceProxy (the target of the garment Clearance shrinkwraps) had only the body's Armature
modifiers, so a body with a breast Corrective Smooth / Shrinkwrap (CS_Br, SW_Br_S: up to 8.5 mm at the bust) was wrapped against a different skin. The
proxy must carry every non-Mask body modifier. Tiny rig: sphere body with a Displace modifier `BR_Disp` and a hide Mask `Hide_x`.
  python3 clearance_proxy.test.py <path/to/clearance.py>   (needs `pip install bpy==5.2.3`)"""
import subprocess, sys, os, tempfile
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
d = body.modifiers.new('BR_Disp', 'DISPLACE'); d.strength = 0.01; d.mid_level = 0.0
mk = body.modifiers.new('Hide_x', 'MASK'); mk.vertex_group = 'Hips'; mk.show_viewport = False
g = sphere('U_Shell', 0.095); g.shape_key_add(name='Basis'); g.shape_key_add(name='CH_t').value = 1.0
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[-1])
'''
RUN = 'import sys,bpy,runpy\nbpy.ops.wm.open_mainfile(filepath=sys.argv[1]); s=sys.argv[2]; sys.argv=["blender","--",*sys.argv[3:]]; runpy.run_path(s, run_name="__main__")\n'
CHECK = r'''
import bpy, sys
p = bpy.data.objects['T_ClearanceProxy']; names = [m.name for m in p.modifiers]
assert 'BR_Disp' in names, ('proxy lacks the body Displace', names)
assert not any(m.type == 'MASK' for m in p.modifiers), ('proxy must stay unmasked', names)
assert p.hide_get(), 'proxy must stay hidden'
print('PASS', names)
'''
for n, s in (('b.py', BUILD), ('r.py', RUN), ('c.py', CHECK)): open(os.path.join(D, n), 'w').write(s)
blend = os.path.join(D, 't.blend'); subprocess.run([sys.executable, os.path.join(D, 'b.py'), blend], check=True, capture_output=True)
fx = subprocess.run([sys.executable, os.path.join(D, 'r.py'), blend, CL, 'body=T_Body', 'prefix=U_', 'hair=T_Hair', 'mask=none', 'pieces=Shell', 'poses=none', 'rounds=0', 'into=CH_t', 'save'], capture_output=True, text=True)
assert fx.returncode == 0, fx.stderr[-2000:]
ck = subprocess.run([sys.executable, os.path.join(D, 'r.py'), blend, os.path.join(D, 'c.py')], capture_output=True, text=True)
assert ck.returncode == 0, (ck.stdout[-800:], ck.stderr[-1500:])
print(ck.stdout.strip().splitlines()[-1])
