"""Tests for the cxy toolkit on a small sample tree. Run: python3 -m unittest discover -s tests (from the cxy folder)."""
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
CXY = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(CXY, "lib"))
sys.path.insert(0, CXY)

import archive
import cxy
import cxylib
import inventory

OLD = time.time() - 3 * 24 * 3600
RULES = {"recent_hours": 6, "protected_areas": {"live/": "running thread"}, "protected_patterns": {"(^|/)freeze/": "proof"}}


def write(root, rel, text, old=True):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)
    if old:
        os.utime(p, (OLD, OLD))
    return p


def sample_tree(root):
    """A tiny project-files: one canonical tool + helper, copies, rounds, an archived folder, a protected area."""
    write(root, "cb/tools/main.py", '"""main.py: the proven tool."""\nimport helper\nprint("hi")\n')
    write(root, "cb/tools/helper.py", '"""helper.py: shared helper."""\n')
    write(root, "cb/old_tools/main.py", '"""main.py: the proven tool."""\nimport helper\nprint("hi")\n')   # byte-identical
    write(root, "cb/old_tools/helper.py", '"""helper.py: shared helper."""\n')                            # identical, but imported by sibling
    write(root, "cb/job/main.py", '"""main.py: a job\'s private fork."""\nprint("fork")\n')
    write(root, "cb/out/run1/build.py", '"""build.py: run 1."""\n')
    write(root, "cb/out/run2/build.py", '"""build.py: run 2, newer."""\n')
    os.utime(os.path.join(root, "cb/out/run2/build.py"), (OLD + 60, OLD + 60))
    write(root, "cb/gate_r3/probe.py", '"""probe.py: one-off probe."""\n')
    write(root, "cb/x/_withdrawn/old.py", '"""old.py: withdrawn."""\n')
    write(root, "live/gate_r1/probe2.py", '"""probe2.py: running thread."""\n')
    write(root, "cb/freeze/v4/tools/fit.py", '"""fit.py: frozen copy."""\n')
    write(root, "cb/male/tools/fit.py", '"""fit.py: frozen copy."""\n')
    write(root, "cb/fresh/gate_r9/new.py", '"""new.py: written a minute ago."""\n', old=False)
    write(root, "cb/used/tool.py", '"""tool.py: named in a doc."""\n')
    write(root, "docs/README.md", "Run `tool.py` for the thing.\n")
    return {"main": {"runner": "py", "path": "cb/tools/main.py", "help": "x"}}


class InventoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.reg = sample_tree(self.root)
        self.rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}

    def tearDown(self):
        self.tmp.cleanup()

    def status(self, rel):
        return self.rows[rel]["status"]

    def test_classifies_every_kind(self):
        self.assertEqual(self.status("cb/tools/main.py"), "canonical")
        self.assertEqual(self.status("cb/tools/helper.py"), "helper")
        self.assertEqual(self.status("cb/old_tools/main.py"), "duplicate")
        self.assertEqual(self.rows["cb/old_tools/main.py"]["keeper"], "cb/tools/main.py")
        self.assertEqual(self.status("cb/job/main.py"), "fork")
        self.assertEqual(self.status("cb/out/run1/build.py"), "dead")
        self.assertEqual(self.rows["cb/out/run1/build.py"]["keeper"], "cb/out/run2/build.py")
        self.assertEqual(self.status("cb/out/run2/build.py"), "dead")   # old round, nobody names it
        self.assertEqual(self.status("cb/gate_r3/probe.py"), "dead")
        self.assertEqual(self.status("cb/x/_withdrawn/old.py"), "dead")
        self.assertEqual(self.status("cb/used/tool.py"), "used")

    def test_frozen_copy_is_the_keeper(self):
        self.assertEqual(self.status("cb/male/tools/fit.py"), "duplicate")
        self.assertEqual(self.rows["cb/male/tools/fit.py"]["keeper"], "cb/freeze/v4/tools/fit.py")

    def test_protection(self):
        self.assertEqual(self.rows["live/gate_r1/probe2.py"]["protect"], "running thread")
        self.assertTrue(self.rows["cb/fresh/gate_r9/new.py"]["protect"].startswith("changed"))
        self.assertEqual(self.rows["cb/freeze/v4/tools/fit.py"]["protect"], "proof")

    def test_archive_plan_is_safe(self):
        moves = {r["path"] for r, _ in archive.plan(list(self.rows.values()), self.root)}
        self.assertIn("cb/old_tools/main.py", moves)
        self.assertIn("cb/out/run1/build.py", moves)
        self.assertIn("cb/male/tools/fit.py", moves)
        for kept in ("cb/tools/main.py", "cb/tools/helper.py", "cb/job/main.py", "cb/used/tool.py",
                     "live/gate_r1/probe2.py", "cb/fresh/gate_r9/new.py", "cb/freeze/v4/tools/fit.py"):
            self.assertNotIn(kept, moves)

    def test_sibling_import_blocks_a_move(self):
        # old_tools/helper.py is a duplicate, but old_tools/main.py imports it: both are candidates, so it may move with it
        moves = {r["path"] for r, _ in archive.plan(list(self.rows.values()), self.root)}
        self.assertIn("cb/old_tools/helper.py", moves)
        # make main.py stay (protected): now helper must stay too
        rows = [dict(r, protect="keep") if r["path"] == "cb/old_tools/main.py" else r for r in self.rows.values()]
        moves = {r["path"] for r, _ in archive.plan(rows, self.root)}
        self.assertNotIn("cb/old_tools/helper.py", moves)

    def test_apply_and_undo_roundtrip(self):
        moves = archive.plan(list(self.rows.values()), self.root)
        dest = os.path.join(self.root, "_archive", "t")
        rep = cxylib.Report(out=io.StringIO())
        n = archive.apply(moves, self.root, dest, rep)
        self.assertEqual(n, len(moves))
        self.assertFalse(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))
        self.assertTrue(os.path.exists(os.path.join(dest, "cb/out/run1/build.py")))
        archive.undo(os.path.join(dest, "MANIFEST.tsv"), self.root, rep)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))
        self.assertFalse(rep.failed)

    def test_changed_file_is_not_moved(self):
        moves = archive.plan(list(self.rows.values()), self.root)
        write(self.root, "cb/out/run1/build.py", "changed after the inventory\n")
        rep = cxylib.Report(out=io.StringIO())
        archive.apply(moves, self.root, os.path.join(self.root, "_archive", "t"), rep)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))

    def test_own_inventory_output_is_not_a_mention(self):
        write(self.root, "cb/INVENTORY.md", "`cb/gate_r3/probe.py` `cb/out/run2/build.py`\n")
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        self.assertEqual(rows["cb/gate_r3/probe.py"]["status"], "dead")

    def test_proven_doc_protects_named_folder(self):
        write(self.root, "PROVEN.md", "method: `cb/male/tools/` proven\n")
        rules = dict(RULES, protected_docs=["PROVEN.md"])
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=rules)}
        self.assertEqual(rows["cb/male/tools/fit.py"]["protect"], "named in PROVEN.md")

    def test_markdown_lists_all_rows(self):
        md = inventory.to_markdown(list(self.rows.values()))
        for rel in self.rows:
            self.assertIn(f"`{rel}`", md)


class ReportTest(unittest.TestCase):
    def test_format_and_exit_code(self):
        buf = io.StringIO()
        r = cxylib.Report(out=buf)
        r.ok("a")
        r.warn("b")
        self.assertEqual(r.finish(), 0)
        r.red("c")
        self.assertEqual(r.finish(), 1)
        lines = buf.getvalue().splitlines()
        self.assertEqual(lines[0], "OK   a")
        self.assertEqual(lines[1], "WARN b")
        self.assertEqual(lines[2], "RESULT PASS (1 ok, 1 warn)")
        self.assertEqual(lines[-1], "RESULT RED (1 red, 1 warn, 1 ok)")

    def test_version_pin(self):
        self.assertTrue(cxylib.version_ok((5, 2, 3)))
        self.assertFalse(cxylib.version_ok((5, 1, 0)))


class RunnerTest(unittest.TestCase):
    def test_build_argv_per_runner(self):
        os.environ["CXY_BLENDER"] = "/b/blender"
        os.environ["CXY_BPY"] = "/b/python"
        try:
            py = cxy.build_argv({"runner": "py", "path": "a/t.py"}, ["x"], root="/r")
            self.assertEqual(py[1:], ["/r/a/t.py", "x"])
            bp = cxy.build_argv({"runner": "bpy", "path": "a/t.py"}, ["in.blend", "--dry"], root="/r")
            self.assertEqual(bp, ["/b/python", "-I", "/r/a/t.py", "in.blend", "--dry"])
            bl = cxy.build_argv({"runner": "blender", "path": "a/t.py", "factory": True}, ["f.blend", "--", "o.json"], root="/r")
            self.assertEqual(bl, ["/b/blender", "-b", "f.blend", "--factory-startup", "-P", "/r/a/t.py", "--", "o.json"])
            bl2 = cxy.build_argv({"runner": "blender", "path": "a/t.py"}, ["f.blend", "build", "d.npz"], root="/r", factory=False)
            self.assertEqual(bl2, ["/b/blender", "-b", "f.blend", "-P", "/r/a/t.py", "--", "build", "d.npz"])
        finally:
            del os.environ["CXY_BLENDER"], os.environ["CXY_BPY"]

    def test_tool_flags_pass_through(self):
        # --dry belongs to the tools (clip_fix, assemble); cxy's own flag is --cxy-dry
        out = subprocess.run([sys.executable, os.path.join(CXY, "cxy.py"), "clip-audit", "--cxy-dry", "a.blend", "b.blend", "--dry"],
                             capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("a.blend b.blend --dry", out.stdout)
        self.assertIn("RESULT PASS (dry run", out.stdout)

    def test_unknown_command_is_red(self):
        out = subprocess.run([sys.executable, os.path.join(CXY, "cxy.py"), "nope"], capture_output=True, text=True)
        self.assertEqual(out.returncode, 1)
        self.assertIn("RESULT RED", out.stdout)

    def test_run_passes_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            good = write(d, "ok.py", "import sys; sys.exit(0)\n")
            bad = write(d, "bad.py", "import sys; sys.exit(3)\n")
            self.assertEqual(cxy.cmd_run("t", {"runner": "py", "path": good}, []), 0)
            self.assertEqual(cxy.cmd_run("t", {"runner": "py", "path": bad}, []), 1)


class RegistryTest(unittest.TestCase):
    def test_registry_is_well_formed(self):
        reg = cxy.load_registry()
        self.assertGreaterEqual(len(reg), 1)
        for k, e in reg.items():
            self.assertIn(e["runner"], ("py", "bpy", "blender", "node"), k)
            self.assertTrue(e["path"] and e["help"], k)

    @unittest.skipUnless(os.path.isdir(os.path.join(cxylib.PF_ROOT, "_cloud_blender")), "project-files not mounted")
    def test_every_registered_script_exists(self):
        for k, e in cxy.load_registry().items():
            self.assertTrue(os.path.isfile(os.path.join(cxylib.PF_ROOT, e["path"])), f"{k}: {e['path']}")


if __name__ == "__main__":
    unittest.main()
