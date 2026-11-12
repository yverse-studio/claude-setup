"""Red before recolour.py exists, green after. Run: python -m unittest discover -s .claude/skills/texture-recolour/scripts -p "test_*.py" """
import colorsys, json, os, subprocess, sys, tempfile, unittest
from unittest import mock
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

    def test_near_grey_pixels_reach_the_target_hue(self):   # gate #514 r1: a damped shift left pale pink yellowish
        uvs, faces, _ = R.read_obj_uv(self.obj)
        before = texture(); before[30:34, 8:12] = (249, 233, 233); m = R.island_mask(uvs, faces, {0}, 64)
        after = R.shift_hsv(before, m, hue_deg=120)
        for y, x in ((24, 12), (31, 9)):
            hue = colorsys.rgb_to_hsv(*(after[y, x] / 255.0))[0] * 360
            self.assertLess(abs(hue - 120), 4, f'pixel {before[y, x]} came out at hue {hue:.0f}')

    def test_v_axis_is_up(self):   # gate #514 r1: a flipped v passed every test because both islands were symmetric in v
        obj = os.path.join(self.dir, 'hi.obj'); open(obj, 'w').write('vt 0.05 0.6\nvt 0.45 0.6\nvt 0.45 0.9\nvt 0.05 0.9\nf 1/1 2/2 3/3 4/4\n')
        uvs, faces, _ = R.read_obj_uv(obj); m = R.island_mask(uvs, faces, {0}, 64)
        self.assertTrue(m[10, 12] and m[24, 12], 'v 0.6 to 0.9 belongs to the top rows')
        self.assertFalse(m[40, 12] or m[60, 12], 'the bottom rows are v near 0, not in the mask')
        self.assertEqual(int(m[32:].sum()), 0)

    def test_grow_widens_the_mask_and_defaults_to_one(self):
        uvs, faces, _ = R.read_obj_uv(self.obj)
        m0, m2 = R.island_mask(uvs, faces, {0}, 64), R.island_mask(uvs, faces, {0}, 64, grow=2)
        self.assertTrue((m2 | m0).sum() == m2.sum() and m2.sum() > m0.sum())
        px = lambda *g: int(np.array(Image.open(os.path.join(self.dir, 'g', 'mask.png'))).astype(bool).sum()) if run(self.tex, self.obj, '--islands', '0', '--hue', '10', *g, '--out', os.path.join(self.dir, 'g')).returncode == 0 else -1
        self.assertEqual(px(), px('--grow', '1')); self.assertGreater(px(), px('--grow', '0'))

    def test_exit_1_when_the_saved_file_differs_outside_the_mask(self):   # gate #514 r1: the check compared the in-memory RGB copy, so a changed alpha or a bad save never showed
        real = np.dstack
        def leaky(arrs, *a, **k):
            out = real(arrs, *a, **k); out[60, 60, 3] = 7; return out
        out = os.path.join(self.dir, 'leak')
        with mock.patch.object(R.np, 'dstack', leaky), mock.patch.object(sys, 'argv', ['recolour.py', self.tex, self.obj, '--islands', '0', '--hue', '90', '--out', out]), mock.patch('builtins.print') as pr:
            self.assertEqual(R.main(), 1)
        self.assertEqual(json.loads(pr.call_args[0][0])['changed_outside_mask'], 1)

    def test_non_numeric_island_fails_with_a_message_not_a_traceback(self):
        p = run(self.tex, self.obj, '--islands', 'a', '--out', self.dir)
        self.assertNotEqual(p.returncode, 0); self.assertIn('--islands', p.stderr); self.assertNotIn('Traceback', p.stderr)

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

    def test_16bit_png_is_refused_not_flattened(self):
        t = os.path.join(self.dir, 'g16.png'); Image.fromarray(np.full((64, 64), 30000, np.uint16)).save(t)
        p = run(t, self.obj, '--islands', '0', '--hue', '10', '--out', os.path.join(self.dir, 'o16'))
        self.assertNotEqual(p.returncode, 0); self.assertIn('8-bit', p.stderr)

    def test_non_numeric_vt_index_is_skipped_not_a_traceback(self):
        obj = os.path.join(self.dir, 'x.obj'); open(obj, 'w').write(OBJ + 'f 1/x 2/2 3/3\n')
        p = run(self.tex, obj, '--list'); self.assertEqual(p.returncode, 0, p.stderr); self.assertNotIn('Traceback', p.stderr)
        self.assertEqual(len(p.stdout.strip().splitlines()), 2)

    def test_list_reports_area_per_island(self):
        p = run(self.tex, self.obj, '--list'); rows = [json.loads(l) for l in p.stdout.strip().splitlines()]
        self.assertEqual([r['island'] for r in rows], [0, 1]); self.assertTrue(all(r['px'] > 1000 and r['faces'] == 1 for r in rows))

    def test_list_is_fast_with_thousands_of_islands(self):
        import time
        lines = [f'vt {0.01 + (i % 70) * 0.014} {0.01 + (i // 70) * 0.014}\nvt {0.01 + (i % 70) * 0.014 + 0.01} {0.01 + (i // 70) * 0.014}\nvt {0.01 + (i % 70) * 0.014} {0.01 + (i // 70) * 0.014 + 0.01}' for i in range(2000)]
        obj = os.path.join(self.dir, 'many.obj'); open(obj, 'w').write('\n'.join(lines) + '\n' + '\n'.join(f'f {3*i+1}/{3*i+1} {3*i+2}/{3*i+2} {3*i+3}/{3*i+3}' for i in range(2000)) + '\n')
        big = os.path.join(self.dir, 'big.png'); Image.fromarray(np.zeros((1024, 1024, 3), np.uint8)).save(big)
        t = time.time(); p = run(big, obj, '--list'); self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(len(p.stdout.strip().splitlines()), 2000); self.assertLess(time.time() - t, 8)

    def test_unknown_island_fails_loudly(self):
        p = run(self.tex, self.obj, '--islands', '9', '--hue', '10', '--out', self.dir)
        self.assertNotEqual(p.returncode, 0)


if __name__ == '__main__': unittest.main()
