"""Unit tests for the cxy-scene-final helpers. Run: python -m unittest test_cxy (from this folder)."""
import json
import os
import sys
import tempfile
import time
import unittest

import cxy_common
import cxy_final
import cxy_gate
import cxy_verify


def make_case(tmp, cams=('T1', 'T2'), frames=range(1, 3), size=10, marker=None):
    cams_json = os.path.join(tmp, 'cams.json')
    with open(cams_json, 'w') as fh:
        json.dump({'tisch': {'cams': [{'name': c} for c in cams]}}, fh)
    out = os.path.join(tmp, 'out')
    for c in cams:
        os.makedirs(os.path.join(out, c), exist_ok=True)
        for f in frames:
            with open(cxy_common.frame_path(out, c, f), 'wb') as fh:
                fh.write(b'x' * size)
    if marker is not None:
        mp = cxy_common.marker_path(out, frames[0], frames[-1])
        os.makedirs(os.path.dirname(mp), exist_ok=True)
        with open(mp, 'w') as fh:
            json.dump(marker, fh)
    return cams_json, out


class Verify(unittest.TestCase):
    def test_green_when_all_frames_and_marker(self):
        with tempfile.TemporaryDirectory() as t:
            cj, out = make_case(t, marker={'ok': True, 'rendered_new': 4})
            self.assertTrue(cxy_verify.check(out, cj, 'tisch', 1, 2)['ok'])

    def test_red_when_rendered_zero(self):
        with tempfile.TemporaryDirectory() as t:
            cj, out = make_case(t, marker={'ok': True, 'rendered_new': 0})
            r = cxy_verify.check(out, cj, 'tisch', 1, 2)
            self.assertFalse(r['ok'])
            self.assertIn('rendered 0', ' '.join(r['problems']))

    def test_red_when_marker_missing(self):
        with tempfile.TemporaryDirectory() as t:
            cj, out = make_case(t)
            self.assertIn('DONE marker missing', ' '.join(cxy_verify.check(out, cj, 'tisch', 1, 2)['problems']))

    def test_red_when_frame_missing_or_empty(self):
        with tempfile.TemporaryDirectory() as t:
            cj, out = make_case(t, size=0, marker={'ok': True, 'rendered_new': 4})
            os.remove(cxy_common.frame_path(out, 'T2', 2))
            p = ' '.join(cxy_verify.check(out, cj, 'tisch', 1, 2)['problems'])
            self.assertIn('1 PNG missing', p)
            self.assertIn('3 PNG with 0 bytes', p)

    def test_only_filters_cams(self):
        with tempfile.TemporaryDirectory() as t:
            cj, out = make_case(t, cams=('T1',), marker={'ok': True, 'rendered_new': 2})
            self.assertTrue(cxy_verify.check(out, cj, 'tisch', 1, 2, only='T1')['ok'])

    def test_red_when_cams_json_broken(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertFalse(cxy_verify.check(t, os.path.join(t, 'nope.json'), 'tisch', 1, 2)['ok'])


class Final(unittest.TestCase):
    def test_overwrite_moves_aside_and_count_new(self):
        with tempfile.TemporaryDirectory() as t:
            _, out = make_case(t)
            self.assertEqual(cxy_final.move_aside(out, ['T1', 'T2'], [1, 2], 'S'), 4)
            self.assertTrue(os.path.exists(os.path.join(out, '_replaced', 'S', 'T1', '001.png')))
            self.assertEqual(cxy_final.count_new(out, ['T1', 'T2'], [1, 2], time.time() - 5), 0)


class Common(unittest.TestCase):
    def test_parse_env_and_opts(self):
        opts = cxy_common.parse_opts(['scene=tisch', 'env=SHAFT_CUT_Z=0.643|FACE_AMT=1.6'])
        self.assertEqual(cxy_common.parse_env(opts['env']), {'SHAFT_CUT_Z': '0.643', 'FACE_AMT': '1.6'})

    def test_plain_list_cams(self):
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, 'c.json')
            with open(p, 'w') as fh:
                json.dump([{'name': 'A'}, {'name': 'B'}], fh)
            self.assertEqual(cxy_common.expected_cams(p, '-'), ['A', 'B'])


@unittest.skipUnless(sys.platform == 'win32', 'gate reads Windows RAM and tasklist')
class Gate(unittest.TestCase):
    def test_stop_file_blocks(self):
        with tempfile.TemporaryDirectory() as t:
            open(os.path.join(t, 'STOP'), 'w').close()
            why, _ = cxy_gate.blocked(t, 0)
            self.assertIn('STOP file set', why)

    def test_ram_threshold_blocks(self):
        with tempfile.TemporaryDirectory() as t:
            why, gb = cxy_gate.blocked(t, 9999)
            self.assertTrue(any('free RAM' in w for w in why))
            self.assertGreater(gb, 0)


if __name__ == '__main__':
    unittest.main()
