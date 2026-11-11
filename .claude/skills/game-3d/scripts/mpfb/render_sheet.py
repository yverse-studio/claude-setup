"""Render a figure .blend: LOD0 front, 3/4, side, back + LOD1-3 front, on one sheet. Usage: render_sheet.py file.blend out.png [pose]"""
import sys, os, math, bpy
from mathutils import Vector, Euler
blend, outp = sys.argv[1], sys.argv[2]; pose = sys.argv[3] if len(sys.argv) > 3 else ''
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.render.resolution_x = 360; sc.render.resolution_y = 720; sc.render.film_transparent = False
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.05, 0.06, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
rig = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and '_LOD' in o.name], key=lambda o: o.name)
if pose:
    exec(open(pose).read())
H = 1.75
def light(name, loc, energy, size=1.5, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
light('key', (1.5, -2.5, 2.6), 300); light('fill', (-2.5, -1.5, 1.4), 80); light('rim', (0, 2.5, 2.2), 150)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
from PIL import Image
shots = []
def shot(obj, angle, tag):
    for o in lods: o.hide_render = (o != obj)
    r = 3.0; a = math.radians(angle)
    cam.location = (math.sin(a) * r, -math.cos(a) * r, 0.86); cam.rotation_euler = (math.radians(90), 0, a)
    p = f'/tmp/npc/_r_{os.path.basename(blend)}_{tag.replace("/","-").replace(" ","_")}.png'; sc.render.filepath = p; bpy.ops.render.render(write_still=True); shots.append((p, tag))
shot(lods[0], 0, 'LOD0 front'); shot(lods[0], 35, 'LOD0 3/4'); shot(lods[0], 90, 'LOD0 side'); shot(lods[0], 180, 'LOD0 back')
for o in lods[1:]: shot(o, 20, o.name.split('_')[-1])
def face(obj, angle, tag):
    for o in lods: o.hide_render = (o != obj)
    top = max((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    a = math.radians(angle); r = 0.75; cam.location = (math.sin(a) * r, -math.cos(a) * r, top - 0.12); cam.rotation_euler = (math.radians(90), 0, a)
    p = f'/tmp/npc/_r_{os.path.basename(blend)}_{tag.replace("/","-").replace(" ","_")}.png'; sc.render.filepath = p; bpy.ops.render.render(write_still=True); shots.append((p, tag))
face(lods[0], 0, 'face front'); face(lods[0], 40, 'face 3/4')
ims = [Image.open(p) for p, _ in shots]
sheet = Image.new('RGB', (360 * len(ims), 760), (20, 20, 22))
from PIL import ImageDraw, ImageFont
d = ImageDraw.Draw(sheet)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
except Exception: f = None
for i, (im, (_, tag)) in enumerate(zip(ims, shots)):
    sheet.paste(im, (360 * i, 40)); d.text((360 * i + 10, 6), tag, fill=(255, 220, 120), font=f)
sheet.save(outp); print('SHEET', outp)
