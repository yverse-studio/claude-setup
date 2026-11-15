import os, shutil, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from clearance_args import arg_error, piece_name, summary_line


def run_script(folder, args, name='clearance.py'):
    """Runs clearance.py as Blender would (python <file> -- <args>), with empty stand-ins for bpy and mathutils on PYTHONPATH."""
    stubs = tempfile.mkdtemp()
    os.makedirs(os.path.join(stubs, 'mathutils'))
    open(os.path.join(stubs, 'bpy.py'), 'w').close()
    open(os.path.join(stubs, 'mathutils', '__init__.py'), 'w').write('class Vector:\n    def __init__(self, *a): pass\n    def normalized(self): return self\n')
    open(os.path.join(stubs, 'mathutils', 'bvhtree.py'), 'w').write('class BVHTree: pass\n')
    env = dict(os.environ, PYTHONSAFEPATH='1', PYTHONPATH=os.pathsep.join([p for p in (stubs, os.environ.get('PYTHONPATH')) if p]))   # no empty entry: it would put the cwd on the path
    try:
        return subprocess.run([sys.executable, os.path.join(folder, name), '--'] + args, capture_output=True, text=True, env=env, timeout=60)
    finally:
        shutil.rmtree(stubs, ignore_errors=True)


class ClearanceArgs(unittest.TestCase):
    def test_piece_name_of_a_cos_name_and_of_a_library_name(self):
        self.assertEqual(piece_name('Caesar_Cos_King_Legs'), 'King_Legs')
        self.assertEqual(piece_name('CL_shirt__sleeve'), 'CL_shirt__sleeve')   # no _Cos_: the whole name, not an IndexError

    def test_summary_line_for_both_name_shapes(self):
        self.assertTrue(summary_line('REST', 'Caesar_Cos_King_Legs', 1.5, 0, 0.0).startswith('REST King_Legs'))
        self.assertTrue(summary_line('REST', 'CL_shirt__sleeve', -2.0, 3, 1.25).startswith('REST CL_shirt__sleeve'))
        self.assertIn('inside    3 (1.25%)', summary_line('REST', 'x', -2.0, 3, 1.25))

    def test_faces_without_report_is_refused_with_a_message(self):
        msg = arg_error(['look=king', 'faces'])
        self.assertIn('faces', msg)
        self.assertIn('report=', msg)

    def test_faces_with_report_and_fix_mode_without_faces_pass(self):
        self.assertIsNone(arg_error(['faces', 'report=out.json']))
        self.assertIsNone(arg_error(['look=king', 'rounds=2', 'save']))

    def test_summarize_prints_through_summary_line(self):
        # summarize() needs a live scene; the stand-in bpy cannot reach it, so this one test reads the source
        src = open(os.path.join(HERE, 'clearance.py'), encoding='utf-8').read()
        self.assertIn('print(summary_line(tag, nm,', src)
        self.assertNotIn('split("_Cos_")[1]', src)

    def test_the_script_run_for_real_refuses_faces_without_report(self):
        r = run_script(HERE, ['look=king', 'faces'])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('`faces` only works with report=', r.stderr)
        self.assertNotIn('Traceback', r.stderr)

    def test_the_script_run_for_real_gets_past_the_argument_check_with_report(self):
        r = run_script(HERE, ['look=king', 'faces', 'report=out.json'])
        self.assertNotIn('only works with report=', r.stderr)   # it goes on to the scene, which the stand-in bpy does not have

    def test_the_script_copied_alone_says_what_is_missing(self):
        d = tempfile.mkdtemp()
        try:
            shutil.copy(os.path.join(HERE, 'clearance.py'), d)
            r = run_script(d, ['look=king'])
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('needs clearance_args.py in the same folder', r.stderr)
            self.assertNotIn('Traceback', r.stderr)
        finally:
            shutil.rmtree(d, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()
