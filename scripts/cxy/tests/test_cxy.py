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
        # treat old_tools/helper.py as a plain duplicate candidate: it may move together with old_tools/main.py
        rows = [dict(r, status="duplicate", mentioned_by=0) if r["path"] == "cb/old_tools/helper.py" else r for r in self.rows.values()]
        moves = {r["path"] for r, _ in archive.plan(rows, self.root)}
        self.assertIn("cb/old_tools/helper.py", moves)
        # make main.py stay (protected): now helper must stay too
        rows = [dict(r, protect="keep") if r["path"] == "cb/old_tools/main.py" else r for r in rows]
        moves = {r["path"] for r, _ in archive.plan(rows, self.root)}
        self.assertNotIn("cb/old_tools/helper.py", moves)

    def test_apply_and_undo_roundtrip(self):
        moves = archive.plan(list(self.rows.values()), self.root)
        dest = os.path.join(self.root, "_archive", "t")
        rep = cxylib.Report(out=io.StringIO())
        n = archive.apply(moves, self.root, dest, rep, rows=list(self.rows.values()))
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

    def test_second_apply_never_overwrites_the_archive(self):
        dest = os.path.join(self.root, "_archive", "t")
        rep = cxylib.Report(out=io.StringIO())
        archive.apply(archive.plan(list(self.rows.values()), self.root), self.root, dest, rep)
        write(self.root, "cb/out/run1/build.py", '"""build.py: run 1."""\n')   # same file back (e.g. a failed undo)
        rows = list(inventory.build(self.root, self.reg, rules=RULES))
        rep2 = cxylib.Report(out=io.StringIO())
        archive.apply(archive.plan(rows, self.root), self.root, dest, rep2)
        self.assertTrue(rep2.failed)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))

    def test_sibling_block_is_transitive(self):
        write(self.root, "cb/gate_r5/a.py", '"""a.py: leaf."""\n')
        write(self.root, "cb/gate_r5/b.py", '"""b.py: uses a."""\nimport a\n')
        write(self.root, "cb/gate_r5/c.py", '"""c.py: uses b."""\nimport b\n')
        rows = [dict(r, protect="keep") if r["path"] == "cb/gate_r5/c.py" else r
                for r in inventory.build(self.root, self.reg, rules=RULES)]
        moves = {r["path"] for r, _ in archive.plan(rows, self.root)}
        self.assertNotIn("cb/gate_r5/b.py", moves)
        self.assertNotIn("cb/gate_r5/a.py", moves)

    def test_module_a_canonical_tool_imports_is_a_helper(self):
        write(self.root, "cb/tools/main.py", '"""main.py: the proven tool."""\nimport common\n')
        write(self.root, "cb/shared/common.py", '"""common.py: imported from another folder."""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        self.assertEqual(rows["cb/shared/common.py"]["status"], "helper")

    def test_named_copy_is_kept(self):
        write(self.root, "cb/a/util.py", '"""util.py: same."""\n')
        write(self.root, "cb/b/util.py", '"""util.py: same."""\n')
        write(self.root, "cb/a/README.md", "run `../b/util.py`\n")   # names it from outside cb/b
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertNotIn("cb/b/util.py", moves)

    def test_undo_uses_the_manifest_root(self):
        dest = os.path.join(self.root, "_archive", "t")
        rep = cxylib.Report(out=io.StringIO())
        archive.apply(archive.plan(list(self.rows.values()), self.root), self.root, dest, rep)
        archive.undo(os.path.join(dest, "MANIFEST.tsv"), "/nonexistent", rep)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))

    def test_apply_needs_a_reviewed_inventory(self):
        out = subprocess.run([sys.executable, os.path.join(CXY, "cxy.py"), "archive", "--apply", "--root", self.root,
                              "--inventory", os.path.join(self.root, "none.json")], capture_output=True, text=True)
        self.assertEqual(out.returncode, 1)
        self.assertIn("no reviewed inventory", out.stdout)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))

    def test_dry_then_apply_moves_the_reviewed_list(self):
        inv = os.path.join(self.root, "inv.json")
        env = dict(os.environ, CXY_RULES=os.path.join(self.root, "rules.json"))
        with open(env["CXY_RULES"], "w") as f:
            json.dump(RULES, f)
        base = [sys.executable, os.path.join(CXY, "cxy.py"), "archive", "--root", self.root, "--inventory", inv,
                "--dest", os.path.join(self.root, "_archive", "t")]
        dry = subprocess.run(base, capture_output=True, text=True, env=env)
        self.assertIn("MOVE cb/out/run1/build.py", dry.stdout)
        app = subprocess.run(base + ["--apply"], capture_output=True, text=True, env=env)
        self.assertEqual(app.returncode, 0, app.stdout)
        self.assertFalse(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))

    def test_package_and_relative_imports_protect_the_module(self):
        write(self.root, "cb/tools/main.py", '"""main.py: tool."""\nfrom lib.util import f\nfrom .rel import g\n')
        write(self.root, "cb/tools/lib/util.py", '"""util.py: same bytes."""\n')
        write(self.root, "cb/common/util.py", '"""util.py: same bytes."""\n')
        write(self.root, "cb/gate_r7/rel.py", '"""rel.py: imported relatively."""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertEqual(rows["cb/tools/lib/util.py"]["status"], "helper")
        self.assertNotIn("cb/tools/lib/util.py", moves)
        self.assertNotIn("cb/gate_r7/rel.py", moves)

    def test_module_imported_from_another_folder_stays(self):
        write(self.root, "cb/other/run_it.py", '"""run_it.py: used."""\nimport sys; sys.path.insert(0, "../r2")\nimport shared_mod\n')
        write(self.root, "cb/r2/shared_mod.py", '"""shared_mod.py: old round."""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertNotIn("cb/r2/shared_mod.py", moves)

    def test_script_written_after_the_inventory_blocks_its_folder(self):
        rows = list(self.rows.values())
        moves = archive.plan(rows, self.root)
        write(self.root, "cb/out/run1/new_user.py", "import build\n")   # appears after the inventory
        rep = cxylib.Report(out=io.StringIO())
        archive.apply(moves, self.root, os.path.join(self.root, "_archive", "t"), rep, rows=rows)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))
        self.assertFalse(os.path.exists(os.path.join(self.root, "cb/gate_r3/probe.py")))

    def test_failed_move_is_reported_and_recorded(self):
        rows = list(self.rows.values())
        moves = [m for m in archive.plan(rows, self.root) if m[0]["path"] == "cb/out/run1/build.py"]
        rep = cxylib.Report(out=io.StringIO())
        orig = archive.shutil.move
        archive.shutil.move = lambda *a: (_ for _ in ()).throw(OSError("disk full"))
        try:
            archive.apply(moves, self.root, os.path.join(self.root, "_archive", "t"), rep, rows=rows)
        finally:
            archive.shutil.move = orig
        self.assertTrue(rep.failed)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))

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
