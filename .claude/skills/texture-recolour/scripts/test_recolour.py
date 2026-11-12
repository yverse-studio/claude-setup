"""Red before recolour.py exists, green after. Run: python -m unittest discover -s .claude/skills/texture-recolour/scripts -p "test_*.py" """
import json, os, subprocess, sys, tempfile, unittest
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recolour as R

# Two quads in UV space, not sharing a vertex: island 0 left half, island 1 right half.
OBJ = """vt 0.05 0.05
vt 0.45 0.05
vt 0.45 0.95
vt 0.05 0.95
vt 0.55 0.05
vt 0.95 0.05
vt 0.95 0.95
vt 0.55 0.95
f 1/1 2/2 3/3 4/4
f 5/5 6/6 7/7 8/8
"""


def texture(size=64):
    a = np.zeros((size, size, 3), np.uint8)
    a[:] = (200, 40, 40)                       # saturated red everywhere
    a[:8, :8] = (128, 128, 128)                # a grey patch inside island 0's area
    return a


class Recolour(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.obj = os.path.join(self.dir, 'm.obj'); open(self.obj, 'w').write(OBJ)
        self.tex = os.path.join(self.dir, 't.png'); Image.fromarray(texture()).save(self.tex)

    def test_islands_are_connected_components_of_shared_uv_vertices(self):
        uvs, faces = R.read_obj_uv(self.obj)
        self.assertEqual(R.island_ids(faces, len(uvs)), [0, 1])   # one id per face, two quads that share no UV vertex

    def test_mask_covers_only_the_picked_island(self):
        uvs, faces = R.read_obj_uv(self.obj)
        m = R.island_mask(uvs, faces, {1}, 64)
        self.assertTrue(m[32, 50] and not m[32, 10])
        self.assertEqual(int(m[:, :32].sum()), 0)

    def test_hue_shift_only_inside_the_mask_and_grey_stays_grey(self):
        uvs, faces = R.read_obj_uv(self.obj)
        before = texture(); m = R.island_mask(uvs, faces, {0}, 64)
        after = R.shift_hsv(before, m, hue_deg=120)
        self.assertTrue(np.array_equal(after[~m], before[~m]), 'a pixel outside the mask changed')
        inside = after[32, 10]; self.assertGreater(inside[1], inside[0], 'red should have turned green')
        grey = after[2, 2]; self.assertLessEqual(int(grey.max()) - int(grey.min()), 2, 'near-grey pixel got tinted')
        self.assertEqual(int(after[32, 10].max()), int(before[32, 10].max()), 'value (brightness) must be kept')

    def test_cli_writes_recoloured_mask_and_before_after_and_reports_zero_outside(self):
        out = os.path.join(self.dir, 'out')
        p = subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(__file__), 'recolour.py'), self.tex, self.obj, '--islands', '0', '--hue', '120', '--out', out], capture_output=True, text=True)
        self.assertEqual(p.returncode, 0, p.stderr)
        rep = json.loads(p.stdout.strip().splitlines()[-1])
        self.assertEqual(rep['changed_outside_mask'], 0)
        self.assertGreater(rep['changed_inside_mask'], 0)
        for f in ('recoloured.png', 'mask.png', 'before_after.png'): self.assertTrue(os.path.exists(os.path.join(out, f)), f)
        ba = Image.open(os.path.join(out, 'before_after.png')); self.assertGreater(ba.width, ba.height)

    def test_unknown_island_fails_loudly(self):
        p = subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(__file__), 'recolour.py'), self.tex, self.obj, '--islands', '9', '--hue', '10', '--out', self.dir], capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)


if __name__ == '__main__': unittest.main()
