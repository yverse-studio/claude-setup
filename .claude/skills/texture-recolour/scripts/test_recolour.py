"""Red before recolour.py exists, green after. Run: python -m unittest discover -s .claude/skills/texture-recolour/scripts -p "test_*.py" """
import json, os, subprocess, sys, tempfile, unittest
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
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


def texture(w=64, h=64):
    a = np.zeros((h, w, 3), np.uint8)
    a[:] = (200, 40, 40)                       # saturated red everywhere
    a[8:16, 8:16] = (128, 128, 128)            # grey patch inside island 0
    a[20:28, 8:16] = (130, 120, 120)           # near-grey (s about 0.08) inside island 0
    return a


def run(*args):
    return subprocess.run([sys.executable, '-I', os.path.join(HERE, 'recolour.py'), *args], capture_output=True, text=True)


class Recolour(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.obj = os.path.join(self.dir, 'm.obj'); open(self.obj, 'w').write(OBJ)
        self.tex = os.path.join(self.dir, 't.png'); Image.fromarray(texture()).save(self.tex)

    def test_islands_are_connected_components_of_shared_uv_vertices(self):
        uvs, faces, skipped = R.read_obj_uv(self.obj)
        self.assertEqual(R.island_ids(faces, len(uvs)), [0, 1])   # one id per face, two quads that share no UV vertex
        self.assertEqual(skipped, 0)

    def test_mask_covers_only_the_picked_island(self):
        uvs, faces, _ = R.read_obj_uv(self.obj)
        m = R.island_mask(uvs, faces, {1}, 64)
        self.assertTrue(m[32, 50] and not m[32, 10])
        self.assertEqual(int(m[:, :32].sum()), 0)

    def test_non_square_texture(self):
        uvs, faces, _ = R.read_obj_uv(self.obj)
        for w, h in ((64, 32), (32, 64)):
            m = R.island_mask(uvs, faces, {0}, w, h)
            self.assertEqual(m.shape, (h, w))
            self.assertTrue(m[h // 2, w // 4] and not m[h // 2, 3 * w // 4])
        t = os.path.join(self.dir, 'wide.png'); Image.fromarray(texture(64, 32)).save(t)
        p = run(t, self.obj, '--islands', '0', '--hue', '90', '--out', os.path.join(self.dir, 'o'))
        self.assertEqual(p.returncode, 0, p.stderr)

    def test_hue_shift_only_inside_the_mask_value_kept_grey_stays_grey(self):
        uvs, faces, _ = R.read_obj_uv(self.obj)
        before = texture(); m = R.island_mask(uvs, faces, {0}, 64)
        self.assertTrue(m[12, 12] and m[24, 12] and not m[2, 60])
        after = R.shift_hsv(before, m, hue_deg=120)
        self.assertTrue(np.array_equal(after[~m], before[~m]), 'a pixel outside the mask changed')
        red = after[40, 10]; self.assertGreater(red[1], red[0], 'red should have turned green')
        self.assertEqual(int(red.max()), int(before[40, 10].max()), 'value (brightness) must be kept')
        grey = after[12, 12]; self.assertLessEqual(int(grey.max()) - int(grey.min()), 2, 'grey inside the mask got tinted')
        near = after[24, 12]; full = R.shift_hsv(before, m, hue_deg=120, grey_sat=1e-6)[24, 12]
        self.assertFalse(np.array_equal(near, full), 'near-grey must get a damped hue shift, not the full one')

    def test_cli_writes_recoloured_mask_and_before_after_and_reports_zero_outside(self):
        out = os.path.join(self.dir, 'out')
        p = run(self.tex, self.obj, '--islands', '0', '--hue', '120', '--out', out)
        self.assertEqual(p.returncode, 0, p.stderr)
        rep = json.loads(p.stdout.strip().splitlines()[-1])
        self.assertEqual(rep['changed_outside_mask'], 0)
        self.assertGreater(rep['changed_inside_mask'], 0)
        for f in ('recoloured.png', 'mask.png', 'before_after.png'): self.assertTrue(os.path.exists(os.path.join(out, f)), f)
        ba = Image.open(os.path.join(out, 'before_after.png')); self.assertGreater(ba.width, ba.height)

    def test_alpha_is_kept(self):
        a = np.dstack([texture(), np.full((64, 64), 255, np.uint8)]); a[50:, :, 3] = 0
        t = os.path.join(self.dir, 'a.png'); Image.fromarray(a, 'RGBA').save(t)
        out = os.path.join(self.dir, 'oa'); p = run(t, self.obj, '--islands', '0', '--hue', '120', '--out', out)
        self.assertEqual(p.returncode, 0, p.stderr)
        res = Image.open(os.path.join(out, 'recoloured.png')); self.assertEqual(res.mode, 'RGBA')
        self.assertTrue(np.array_equal(np.array(res)[..., 3], a[..., 3]), 'alpha changed')

    def test_obj_indices_negative_and_missing_vt(self):
        obj = os.path.join(self.dir, 'n.obj')
        open(obj, 'w').write(OBJ.replace('f 5/5 6/6 7/7 8/8', 'f 5/-4 6/-3 7/-2 8/-1') + 'f 1 2 3\nf 1/1 2 3/3\n')
        uvs, faces, skipped = R.read_obj_uv(obj)
        self.assertEqual(faces[1], [4, 5, 6, 7]); self.assertEqual(skipped, 2)
        self.assertEqual(R.island_ids(faces, len(uvs)), [0, 1])
        p = run(self.tex, obj, '--islands', '1', '--hue', '10', '--out', os.path.join(self.dir, 'on'))
        self.assertEqual(p.returncode, 0, p.stderr); self.assertIn('ignored', p.stderr)

    def test_empty_mask_fails_with_a_message_not_a_traceback(self):
        obj = os.path.join(self.dir, 'tiny.obj')
        open(obj, 'w').write('vt 0.5 0.5\nvt 0.501 0.5\nvt 0.5 0.501\nf 1/1 2/2 3/3\n')
        p = run(self.tex, obj, '--islands', '0', '--hue', '10', '--out', os.path.join(self.dir, 'ot'))
        self.assertNotEqual(p.returncode, 0); self.assertIn('0 pixels', p.stderr); self.assertNotIn('Traceback', p.stderr)

    def test_unknown_island_fails_loudly(self):
        p = run(self.tex, self.obj, '--islands', '9', '--hue', '10', '--out', self.dir)
        self.assertNotEqual(p.returncode, 0)


if __name__ == '__main__': unittest.main()
