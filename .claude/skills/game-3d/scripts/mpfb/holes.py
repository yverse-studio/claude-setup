"""Silhouette hole check: render each LOD front/back/3-4 on magenta, count magenta pixels the border flood fill cannot reach
(background seen through the figure). Usage: holes.py file.blend -> prints per LOD/view hole pixels; exit 1 if any > 40."""
import sys, math, bpy
from mathutils import Vector
import numpy as np, os, tempfile
TMP = os.path.join(tempfile.gettempdir(), 'mpfb_holes.png')
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'SINGLE'
sc.display.shading.single_color = (0.2, 0.2, 0.2); sc.render.resolution_x = 300; sc.render.resolution_y = 600
w = bpy.data.worlds.new('w'); sc.world = w; w.color = (1, 0, 1); sc.display.shading.background_type = 'WORLD'
sc.view_settings.view_transform = 'Standard'
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and '_LOD' in o.name], key=lambda o: o.name)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 50
from scipy import ndimage
bad = 0
for o in lods:
    for a in (0, 35, 90, 180, 215):
        for x in lods: x.hide_render = (x != o)
        r = math.radians(a); cam.location = (math.sin(r) * 3.0, -math.cos(r) * 3.0, 0.86); cam.rotation_euler = (math.radians(90), 0, r)
        sc.render.filepath = TMP; bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(TMP); px = np.array(img.pixels[:]).reshape(600, 300, 4); bpy.data.images.remove(img)
        mag = (px[..., 0] > 0.9) & (px[..., 1] < 0.1) & (px[..., 2] > 0.9)
        lab, n = ndimage.label(mag); border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
        holes = int(sum((lab == k).sum() for k in range(1, n + 1) if k not in border))
        # gaps between legs and arms are real background: count only blobs fully inside the torso band
        print('HOLES', o.name, a, holes); bad = max(bad, holes)
sys.exit(1 if bad > 40 else 0)
