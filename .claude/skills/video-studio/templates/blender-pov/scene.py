import bpy, math, sys, os
out = sys.argv[1]; vrm = sys.argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.device = 'CPU'
sc.render.resolution_x, sc.render.resolution_y = 540, 960
sc.frame_start, sc.frame_end = 1, 24; sc.render.fps = 12
sc.cycles.use_denoising = False
# blockout: floor, back wall, a box
def box(name, loc, scale, col):
    bpy.ops.mesh.primitive_cube_add(location=loc); o = bpy.context.object; o.name = name; o.scale = scale
    m = bpy.data.materials.new(name); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = col; o.data.materials.append(m)
box('floor', (0,0,-0.05), (4,4,0.05), (0.55,0.5,0.45,1))
box('wall', (0,2.2,2), (4,0.1,2), (0.35,0.42,0.55,1))
box('crate', (-1.0,0.6,0.35), (0.35,0.35,0.35), (0.8,0.5,0.25,1))
# node VFX: emissive sphere, noise*voronoi, animated by Mapping location (not 4D W)
bpy.ops.mesh.primitive_uv_sphere_add(location=(1.0,0.6,0.9), radius=0.35, segments=32, ring_count=16)
fx = bpy.context.object; fx.name='fx'; bpy.ops.object.shade_smooth()
m = bpy.data.materials.new('fx'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
no = nt.nodes.new('ShaderNodeTexNoise'); vo = nt.nodes.new('ShaderNodeTexVoronoi')
mx = nt.nodes.new('ShaderNodeMath'); mx.operation='MULTIPLY'
ramp = nt.nodes.new('ShaderNodeValToRGB'); em = nt.nodes.new('ShaderNodeEmission'); op = nt.nodes.new('ShaderNodeOutputMaterial')
no.inputs['Scale'].default_value = 4; vo.inputs['Scale'].default_value = 5
nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], no.inputs['Vector']); nt.links.new(mp.outputs['Vector'], vo.inputs['Vector'])
nt.links.new(no.outputs['Fac'], mx.inputs[0]); nt.links.new(vo.outputs['Distance'], mx.inputs[1]); nt.links.new(mx.outputs[0], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].color=(0.02,0.1,0.3,1); ramp.color_ramp.elements[1].color=(0.3,1.0,0.9,1)
nt.links.new(ramp.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 4
nt.links.new(em.outputs[0], op.inputs['Surface']); fx.data.materials.append(m)
mp.inputs['Location'].default_value = (0,0,0); mp.inputs['Location'].keyframe_insert('default_value', frame=1)
mp.inputs['Location'].default_value = (0,0,2); mp.inputs['Location'].keyframe_insert('default_value', frame=24)
# VRM character (glTF) with a wave
bpy.ops.import_scene.gltf(filepath=vrm)
arm = next(o for o in bpy.data.objects if o.type=='ARMATURE')
print('ARM', arm.name, len(arm.pose.bones), [b.name for b in arm.pose.bones if 'pper' in b.name or 'houlder' in b.name][:8])
for o in bpy.data.objects: print('OBJ', o.name, o.type, tuple(round(v,2) for v in o.dimensions))
# camera + light
bpy.ops.object.light_add(type='SUN', location=(2,-3,4)); bpy.context.object.data.energy = 3; bpy.context.object.rotation_euler=(0.9,0.2,0.5)
bpy.ops.object.camera_add(location=(0,-4.2,1.2), rotation=(math.radians(88),0,0)); sc.camera = bpy.context.object
bpy.data.worlds.new('w'); sc.world = bpy.data.worlds['w']; sc.world.color=(0.05,0.06,0.09)
# wave: find right upper arm
names = [b.name for b in arm.pose.bones]
import json; json.dump(names, open(out+'/bones.json','w'))
bpy.ops.wm.save_as_mainfile(filepath=out+'/scene.blend')
