import bpy, math, random, sys, os
random.seed(7)
args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
W = int(args[0]) if len(args) > 0 else 540
H = int(args[1]) if len(args) > 1 else 960
SAMPLES = int(args[2]) if len(args) > 2 else 24
OUT = os.path.abspath(args[3] if len(args) > 3 else "frames/f_")  # absolute: a relative render path wrote nothing
FSTART = int(args[4]) if len(args) > 4 else 1
FEND = int(args[5]) if len(args) > 5 else 480
FPS = 24

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.cycles.device = 'CPU'  # cloud has no GPU; Eevee variant: see README
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.fps = FPS
sc.frame_start, sc.frame_end = FSTART, FEND
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = OUT
sc.view_settings.view_transform = 'AgX'

def mat(name, rgb, rough=0.6, emit=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m

def box(name, loc, size, m, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (size[0]/2, size[1]/2, size[2]/2)
    o.data.materials.append(m); return o

wood = mat("wood", (0.45, 0.22, 0.08), 0.5)
wall = mat("wall", (0.82, 0.78, 0.68), 0.9)
floor = mat("floor", (0.55, 0.3, 0.12), 0.35)
plaid = mat("plaid", (0.15, 0.2, 0.45), 0.9)
white = mat("white", (0.9, 0.9, 0.88), 0.7)
dark = mat("dark", (0.04, 0.04, 0.05), 0.4)
screen = mat("screen", (0.3, 0.7, 1.0), 0.2, emit=3)

# room: floor, back wall, left wall (window), right wall
box("floor", (0, 0, -0.05), (6, 6, 0.1), floor)
box("backwall", (0, 3, 1.5), (6, 0.1, 3), wall)
box("ceiling", (0, 0, 3.05), (6, 6, 0.1), wall)
box("rightwall", (3, 0, 1.5), (0.1, 6, 3), wall)
lw = box("leftwall", (-3, 0, 1.5), (0.1, 6, 3), wall)
# window hole look: bright emissive plane on left wall
win = mat("win", (1, 0.97, 0.9), 1, emit=6)
box("window", (-2.93, 0.3, 1.7), (0.02, 1.8, 1.2), win)
sun = bpy.data.lights.new("sun", 'AREA'); sun.energy = 250; sun.size = 2.4; sun.color = (1, 0.93, 0.8)
so = bpy.data.objects.new("sunlight", sun); sc.collection.objects.link(so)
so.location = (-2.4, 0.3, 1.8); so.rotation_euler = (0, math.radians(-90), 0)
fill = bpy.data.lights.new("fill", 'POINT'); fill.energy = 120; fill.color = (1, 0.85, 0.7)
fo = bpy.data.objects.new("fill", fill); sc.collection.objects.link(fo); fo.location = (1, -2, 2.5)
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.2, 0.2, 0.25, 1)

movers = []  # (obj, home_loc, home_rot)
def add(o): movers.append(o); return o

# furniture and props
add(box("bed", (-1.6, 1.6, 0.3), (1.1, 2.1, 0.6), wood))
add(box("mattress", (-1.6, 1.6, 0.65), (1.0, 2.0, 0.2), plaid))
add(box("pillow", (-1.6, 2.4, 0.85), (0.8, 0.4, 0.15), white))
add(box("desk", (0.2, 2.5, 0.38), (1.6, 0.7, 0.76), wood))
add(box("chair", (0.3, 1.6, 0.25), (0.5, 0.5, 0.5), dark))
add(box("tv_stand", (2.3, 1.5, 0.3), (1.0, 0.8, 0.6), wood))
add(box("crt", (2.3, 1.5, 0.85), (0.8, 0.7, 0.5), dark))
add(box("crt_screen", (2.3, 1.14, 0.85), (0.6, 0.02, 0.38), screen))
add(box("pc", (0.0, 2.5, 0.95), (0.5, 0.4, 0.38), white))
add(box("pc_screen", (0.0, 2.29, 0.97), (0.38, 0.02, 0.28), screen))
add(box("stereo", (2.3, 1.5, 1.25), (0.7, 0.3, 0.3), dark))
for i, c in enumerate([(0.9, 0.1, 0.1), (0.1, 0.4, 0.9), (0.95, 0.75, 0.1), (0.2, 0.7, 0.3), (0.8, 0.3, 0.7)]):
    add(box(f"poster{i}", (-1.0 + i*0.95, 2.93, 1.9 + (i % 2)*0.2), (0.6, 0.02, 0.85), mat(f"p{i}", c, 0.8)))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=(0.2, -0.2, 0.2), segments=24, ring_count=12)
ball = bpy.context.object; ball.name = "ball"; ball.data.materials.append(white); add(ball)
for k in range(3):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.16, location=(-0.4 + k*0.9, 0.4 + k*0.3, 0.08))
    cup = bpy.context.object; cup.name = f"cup{k}"
    cup.data.materials.append(mat(f"cup{k}", [(0.9, 0.2, 0.2), (0.2, 0.5, 0.9), (0.95, 0.8, 0.2)][k], 0.4)); add(cup)
for k in range(40):
    p = box(f"paper{k}", (random.uniform(-1.4, 1.8), random.uniform(-0.6, 1.2), 0.01 + k*0.0005),
            (0.3, 0.21, 0.004), white, rot=(0, 0, random.uniform(0, 6.28))); add(p)
for k in range(5):
    add(box(f"book{k}", (random.uniform(1.2, 2.2), random.uniform(-0.3, 0.6), 0.04),
            (0.25, 0.18, 0.05), mat(f"b{k}", (random.random(), random.random(), random.random()), 0.7), rot=(0, 0, random.uniform(0, 6.28))))
add(box("sneaker", (1.4, -0.4, 0.07), (0.3, 0.12, 0.14), dark, rot=(0, 0, 0.5)))

# animation: calm 0-4s, burst 4-6s, float 6-10s, return 10-13s, calm 13-16s
def fr(sec): return int(sec * FPS) + 1
for o in movers:
    h = o.location.copy(); hr = o.rotation_euler.copy()
    d = random.uniform(0.8, 2.6)
    ang = random.uniform(0, 6.28)
    away = (h.x + math.cos(ang)*d, h.y*0.6 + random.uniform(-1.2, 0.8), random.uniform(0.9, 2.6))
    spin = (hr.x + random.uniform(-4, 4), hr.y + random.uniform(-4, 4), hr.z + random.uniform(-6, 6))
    o.location = h; o.rotation_euler = hr
    o.keyframe_insert("location", frame=fr(0)); o.keyframe_insert("rotation_euler", frame=fr(0))
    o.keyframe_insert("location", frame=fr(4)); o.keyframe_insert("rotation_euler", frame=fr(4))
    o.location = away; o.rotation_euler = spin
    o.keyframe_insert("location", frame=fr(6)); o.keyframe_insert("rotation_euler", frame=fr(6))
    o.location = (away[0] + random.uniform(-0.2, 0.2), away[1] + random.uniform(-0.2, 0.2), away[2] + random.uniform(-0.2, 0.3))
    o.rotation_euler = (spin[0] + 0.6, spin[1] - 0.5, spin[2] + 0.8)
    o.keyframe_insert("location", frame=fr(10)); o.keyframe_insert("rotation_euler", frame=fr(10))
    o.location = h; o.rotation_euler = hr
    o.keyframe_insert("location", frame=fr(13)); o.keyframe_insert("rotation_euler", frame=fr(13))
    o.keyframe_insert("location", frame=fr(16)); o.keyframe_insert("rotation_euler", frame=fr(16))

# camera: portrait, slow push-in
cam = bpy.data.cameras.new("cam"); cam.lens = 26
co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
co.location = (0.2, -4.6, 2.0); co.rotation_euler = (math.radians(80), 0, 0)
co.keyframe_insert("location", frame=fr(0))
co.location = (0.2, -3.3, 1.8); co.keyframe_insert("location", frame=fr(8))
co.location = (0.2, -4.6, 2.0); co.keyframe_insert("location", frame=fr(16))

if "--save" in args:
    bpy.ops.wm.save_as_mainfile(filepath=args[args.index("--save")+1])
bpy.ops.render.render(animation=True)
