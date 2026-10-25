import bpy, math, sys, random
from mathutils import Matrix, Vector
OUT = sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath='scene.blend')  # made by scene.py
sc = bpy.context.scene; sc.cycles.samples = 8; sc.render.resolution_x, sc.render.resolution_y = 540, 960
for n in ('Face','Hair001','fx'): bpy.data.objects[n].hide_render = True
bpy.data.objects['wall'].location.y = 11; bpy.data.objects['crate'].location = (-1.6, 3.0, 0.35)
for i,(x,y,h) in enumerate([(-3,8,3),(3.5,9,5),(-1.5,12,7),(1.2,10,4),(-5,14,6),(5,13,8),(0,16,9)]):  # towers = blockout of the fantasy city
    bpy.ops.mesh.primitive_cube_add(location=(x,y,h/2)); o=bpy.context.object; o.scale=(0.35,0.35,h/2)
    m=bpy.data.materials.new('t%d'%i); m.use_nodes=True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.12,0.1,0.2,1); o.data.materials.append(m)
w=sc.world; w.use_nodes=True; wn=w.node_tree; wn.nodes.clear()
tcw=wn.nodes.new('ShaderNodeTexCoord'); sep=wn.nodes.new('ShaderNodeSeparateXYZ'); rmp=wn.nodes.new('ShaderNodeValToRGB'); bg=wn.nodes.new('ShaderNodeBackground'); wo=wn.nodes.new('ShaderNodeOutputWorld')
wn.links.new(tcw.outputs['Generated'],sep.inputs[0]); wn.links.new(sep.outputs['Z'],rmp.inputs['Fac']); wn.links.new(rmp.outputs['Color'],bg.inputs['Color']); wn.links.new(bg.outputs[0],wo.inputs[0])
rmp.color_ramp.elements[0].position=0.35; rmp.color_ramp.elements[0].color=(1.0,0.45,0.12,1); rmp.color_ramp.elements[1].position=0.75; rmp.color_ramp.elements[1].color=(0.05,0.12,0.35,1); bg.inputs['Strength'].default_value=1.2
sc.view_settings.view_transform='Standard'
# second person: a rival standing in the plaza, facing the camera
before=set(bpy.data.objects.keys())
bpy.ops.import_scene.gltf(filepath='/mnt/project-files/claude-setup/hq-characters/remix/rosa.vrm')
new=[bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before]
rival=next(o for o in new if o.type=='ARMATURE'); rival.location=(0.6,4.5,0); rival.rotation_euler=(0,0,math.pi)
for o in new:
    if o.type=='MESH' and o.name.startswith('Face'): pass
arm = bpy.data.objects['Armature']
cam = sc.camera; cam.location=(0,0.12,1.56); cam.rotation_euler=(math.radians(78),0,0); cam.data.lens=22; cam.data.clip_start=0.03
def rotw(name, axis, deg):
    b = arm.pose.bones[name]; h=b.matrix.translation.copy(); b.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg),4,axis) @ Matrix.Translation(-h) @ b.matrix; bpy.context.view_layer.update()
def reset():
    for b in arm.pose.bones: b.rotation_mode='QUATERNION'; b.rotation_quaternion=(1,0,0,0)
    bpy.context.view_layer.update()
def rival_pose(t):
    # she raises both arms in a guard as the fire flies; world-space rotations on her armature
    g=min(1,max(0,(t-0.6)/0.25))
    for b in rival.pose.bones: b.rotation_mode='QUATERNION'; b.rotation_quaternion=(1,0,0,0)
    bpy.context.view_layer.update()
    for nm,ax,d in (('J_Bip_R_UpperArm','Y',70*g),('J_Bip_L_UpperArm','Y',-70*g)):
        b=rival.pose.bones[nm]; h=b.matrix.translation.copy(); b.matrix=Matrix.Translation(h)@Matrix.Rotation(math.radians(d),4,ax)@Matrix.Translation(-h)@b.matrix
    bpy.context.view_layer.update()
# fire material factory
def fire_mat():
    m = bpy.data.materials.new('fire'); m.use_nodes=True; nt=m.node_tree; nt.nodes.clear()
    tc=nt.nodes.new('ShaderNodeTexCoord'); mp=nt.nodes.new('ShaderNodeMapping'); no=nt.nodes.new('ShaderNodeTexNoise'); vo=nt.nodes.new('ShaderNodeTexVoronoi')
    mx=nt.nodes.new('ShaderNodeMath'); mx.operation='MULTIPLY'; rp=nt.nodes.new('ShaderNodeValToRGB'); em=nt.nodes.new('ShaderNodeEmission'); op=nt.nodes.new('ShaderNodeOutputMaterial')
    no.inputs['Scale'].default_value=5; vo.inputs['Scale'].default_value=6
    nt.links.new(tc.outputs['Object'],mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'],no.inputs['Vector']); nt.links.new(mp.outputs['Vector'],vo.inputs['Vector'])
    nt.links.new(no.outputs['Fac'],mx.inputs[0]); nt.links.new(vo.outputs['Distance'],mx.inputs[1]); nt.links.new(mx.outputs[0],rp.inputs['Fac'])
    rp.color_ramp.elements[0].position=0.2; rp.color_ramp.elements[0].color=(0.6,0.0,0.0,1); rp.color_ramp.elements[1].color=(1.0,0.55,0.05,1)
    em.inputs['Strength'].default_value=3; nt.links.new(rp.outputs['Color'],em.inputs['Color']); nt.links.new(em.outputs[0],op.inputs['Surface'])
    return m, mp
mat, mp = fire_mat()
random.seed(3); N=70
parts=[]
for i in range(N):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=12, ring_count=8); o=bpy.context.object; o.data.materials.append(mat); parts.append((o, random.random(), random.uniform(0.6,1.4)))
def handpos(n): return arm.matrix_world @ arm.pose.bones[n].tail
F=72
for o in bpy.data.objects:
    if o.type=='MESH' and o.parent is None and o.name in ('Face','Hair001'): pass
for f in range(1,F+1):
    t=(f-1)/(F-1); sc.frame_set(f); reset(); cam.location=(0.01*math.sin(t*20),0.12,1.56+0.012*math.sin(t*14)); rival_pose(t)
    lift = min(1,t/0.35)                       # arms rise to guard stance
    rotw('J_Bip_R_UpperArm','Z',  65*lift); rotw('J_Bip_L_UpperArm','Z', -65*lift)
    rotw('J_Bip_R_UpperArm','X', -10*lift); rotw('J_Bip_L_UpperArm','X', -10*lift)
    rotw('J_Bip_R_LowerArm','Z', 20*lift); rotw('J_Bip_L_LowerArm','Z', -20*lift)
    if t>0.6:                                   # thrust forward on the throw
        th=(t-0.6)/0.4; rotw('J_Bip_R_UpperArm','Z',-20*th)
    hr, hl = handpos('J_Bip_R_Hand'), handpos('J_Bip_L_Hand'); mid=(hr+hl)/2
    for o,ph,sz in parts:
        o.hide_render = False
        if t<0.35: o.hide_render=True; continue
        grow = min(1,(t-0.35)/0.2)
        ang = ph*6.28 + t*14
        if t<0.6:   # swirling ball held between the hands
            r=0.09*grow*sz; c=mid+Vector((0,0.12,0.16)); o.location=c+Vector((math.cos(ang)*r*1.6, math.sin(ang)*r*0.8, math.sin(ang*1.3)*r*1.6)); s=0.018*grow*sz
        else:       # thrown stream: each particle flies on its own delay toward the towers
            th=(t-0.6)/0.4; d=max(0,th*1.3-ph*0.3)*9; sp=0.18*(1-0.5*th)
            o.location=mid+Vector((0,0.12,0.16))+Vector((math.cos(ang)*sp*min(1,d), d, math.sin(ang)*sp*min(1,d)*0.8)); s=0.03*sz*(1.2-0.6*th)
        o.scale=(s,s,s)
    mp.inputs['Location'].default_value=(0,0,t*3)
    import os
    if f in (30,40,50): print('DBG',f,tuple(round(x,2) for x in mid),tuple(round(x,3) for x in parts[0][0].location),tuple(round(x,3) for x in parts[0][0].scale), tuple(round(x,2) for x in hr), tuple(round(x,2) for x in hl))
    if os.environ.get('ONLY') and str(f) not in os.environ['ONLY'].split(','): continue
    sc.render.filepath=f'{OUT}/f{f:03d}.png'; bpy.ops.render.render(write_still=True)
