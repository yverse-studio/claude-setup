import os, subprocess, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clearance_args import arg_error, piece_name


class ClearanceArgs(unittest.TestCase):
    def test_piece_name_of_a_cos_name_and_of_a_library_name(self):
        self.assertEqual(piece_name('Caesar_Cos_King_Legs'), 'King_Legs')
        self.assertEqual(piece_name('CL_shirt__sleeve'), 'CL_shirt__sleeve')   # no _Cos_: the whole name, not an IndexError

    def test_faces_without_report_is_refused_with_a_message(self):
        msg = arg_error(['look=king', 'faces'])
        self.assertIn('faces', msg)
        self.assertIn('report=', msg)

    def test_faces_with_report_and_fix_mode_without_faces_pass(self):
        self.assertIsNone(arg_error(['faces', 'report=out.json']))
        self.assertIsNone(arg_error(['look=king', 'rounds=2', 'save']))

    def test_clearance_py_uses_both_helpers(self):
        src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clearance.py'), encoding='utf-8').read()
        self.assertNotIn('nm.split("_Cos_")[1]', src)
        self.assertIn('arg_error(ARGV)', src)


if __name__ == '__main__':
    unittest.main()
