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

REAL_TOUCHED = inventory.touched
# the sample tree fakes ages with utime, which cannot set ctime: tests age by mtime unless they restore REAL_TOUCHED
inventory.touched = lambda st: st.st_mtime

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
    write(root, "cb/r1_tools/main.py", '"""main.py: the proven tool."""\nimport helper\nprint("hi")\n')   # byte-identical
    write(root, "cb/r1_tools/helper.py", '"""helper.py: shared helper."""\n')                            # identical, but imported by sibling
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
        self.assertEqual(self.status("cb/r1_tools/main.py"), "duplicate")
        self.assertEqual(self.rows["cb/r1_tools/main.py"]["keeper"], "cb/tools/main.py")
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
        self.assertIn("cb/r1_tools/main.py", moves)
        self.assertIn("cb/out/run1/build.py", moves)
        self.assertNotIn("cb/male/tools/fit.py", moves)   # duplicate outside a round folder: listed, not moved
        for kept in ("cb/tools/main.py", "cb/tools/helper.py", "cb/job/main.py", "cb/used/tool.py",
                     "live/gate_r1/probe2.py", "cb/fresh/gate_r9/new.py", "cb/freeze/v4/tools/fit.py"):
            self.assertNotIn(kept, moves)

    def test_sibling_import_blocks_a_move(self):
        # treat r1_tools/helper.py as a plain duplicate candidate: it may move together with r1_tools/main.py
        rows = [dict(r, status="duplicate", mentioned_by=0) if r["path"] == "cb/r1_tools/helper.py" else r for r in self.rows.values()]
        moves = {r["path"] for r, _ in archive.plan(rows, self.root)}
        self.assertIn("cb/r1_tools/helper.py", moves)
        # make main.py stay (protected): now helper must stay too
        rows = [dict(r, protect="keep") if r["path"] == "cb/r1_tools/main.py" else r for r in rows]
        moves = {r["path"] for r, _ in archive.plan(rows, self.root)}
        self.assertNotIn("cb/r1_tools/helper.py", moves)

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
        out = write(self.root, "cb/INVENTORY.md", "`cb/gate_r3/probe.py` `cb/out/run2/build.py`\n")   # written by --out here
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES, skip=[out])}
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

    def sample_env(self):
        reg = os.path.join(self.root, "registry.json")
        with open(reg, "w") as f:
            json.dump(self.reg, f)
        rules = os.path.join(self.root, "rules.json")
        with open(rules, "w") as f:
            json.dump(RULES, f)
        return dict(os.environ, CXY_REGISTRY=reg, CXY_RULES=rules)

    def test_apply_needs_a_reviewed_inventory(self):
        out = subprocess.run([sys.executable, os.path.join(CXY, "cxy.py"), "archive", "--apply", "--root", self.root,
                              "--inventory", os.path.join(self.root, "none.json")], capture_output=True, text=True,
                             env=self.sample_env())
        self.assertEqual(out.returncode, 1)
        self.assertIn("no reviewed inventory", out.stdout)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))

    def test_dry_then_apply_moves_the_reviewed_list(self):
        inv = os.path.join(self.root, "inv.json")
        env = self.sample_env()
        # the CLI with mtime ages (the sample tree cannot fake ctime)
        aged = ("import sys; sys.path[:0] = [%r, %r]; import inventory; inventory.touched = lambda st: st.st_mtime; "
                "import cxy; sys.exit(cxy.main(sys.argv[1:]))" % (os.path.join(CXY, "lib"), CXY))
        base = [sys.executable, "-c", aged, "archive", "--root", self.root, "--inventory", inv,
                "--dest", os.path.join(self.root, "_archive", "t")]
        dry = subprocess.run(base, capture_output=True, text=True, env=env)
        self.assertIn("MOVE cb/out/run1/build.py", dry.stdout)
        app = subprocess.run(base + ["--apply"], capture_output=True, text=True, env=env)
        self.assertEqual(app.returncode, 0, app.stdout)
        self.assertFalse(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))

    def test_apply_refuses_a_list_rewritten_after_the_dry_run(self):
        inv = os.path.join(self.root, "plan.json")
        aged = ("import sys; sys.path[:0] = [%r, %r]; import inventory; inventory.touched = lambda st: st.st_mtime; "
                "import cxy; sys.exit(cxy.main(sys.argv[1:]))" % (os.path.join(CXY, "lib"), CXY))
        cli = [sys.executable, "-c", aged]
        env = self.sample_env()
        subprocess.run(cli + ["archive", "--root", self.root, "--inventory", inv], capture_output=True, text=True, env=env)
        # `cxy inventory` onto the same file (or any edit) after the review
        subprocess.run(cli + ["inventory", "--root", self.root, "--out", os.path.join(self.root, "plan.md")],
                       capture_output=True, text=True, env=env)
        app = subprocess.run(cli + ["archive", "--apply", "--root", self.root, "--inventory", inv,
                                    "--dest", os.path.join(self.root, "_archive", "t")], capture_output=True, text=True, env=env)
        self.assertEqual(app.returncode, 1, app.stdout)
        self.assertIn("not the list the last", app.stdout)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")))

    def test_apply_moves_only_printed_files_a_fresh_scan_still_allows(self):
        write(self.root, "cb/out/run1/notes.txt", "uses helper2\n")
        write(self.root, "cb/out/run1/helper2.py", '"""helper2"""\n')
        inv = os.path.join(self.root, "plan.json")
        aged = ("import sys; sys.path[:0] = [%r, %r]; import inventory; inventory.touched = lambda st: st.st_mtime; "
                "import cxy; sys.exit(cxy.main(sys.argv[1:]))" % (os.path.join(CXY, "lib"), CXY))
        base = [sys.executable, "-c", aged, "archive", "--root", self.root, "--inventory", inv,
                "--dest", os.path.join(self.root, "_archive", "t")]
        env = self.sample_env()
        dry = subprocess.run(base, capture_output=True, text=True, env=env)
        self.assertIn("MOVE cb/out/run1/build.py", dry.stdout)
        self.assertIn("MOVE cb/gate_r3/probe.py", dry.stdout)
        self.assertNotIn("helper2.py", dry.stdout)
        os.rename(os.path.join(self.root, "cb/out/run1/notes.txt"), os.path.join(self.root, "notes.bak"))   # not printed -> never moves
        write(self.root, "laptop/go.bat", "python cb\\gate_r3\\probe.py\r\n")   # synced up with an old mtime
        app = subprocess.run(base + ["--apply"], capture_output=True, text=True, env=env)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/out/run1/helper2.py")), app.stdout)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/gate_r3/probe.py")), app.stdout)
        self.assertFalse(os.path.exists(os.path.join(self.root, "cb/out/run1/build.py")), app.stdout)

    def test_symlinked_tool_and_its_target_stay(self):
        write(self.root, "run13/bake.py", '"""bake.py: current version"""\n')
        os.makedirs(os.path.join(self.root, "tools"), exist_ok=True)
        os.symlink("../run13/bake.py", os.path.join(self.root, "tools/bake.py"))
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        self.assertEqual(rows["run13/bake.py"]["protect"], "symlink target")
        self.assertEqual(rows["tools/bake.py"]["protect"], "symlink")
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertFalse(moves & {"run13/bake.py", "tools/bake.py"})

    def test_project_docs_named_like_inventory_are_read(self):
        write(self.root, "docs/INVENTORY_SPEC.md", "run `cb/gate_r3/probe.py` before export\n")
        write(self.root, "game/INVENTORY.md", "Rebuild icons: python run12/gen_item_icons.py\n")   # the game's item inventory
        write(self.root, "run12/gen_item_icons.py", '"""icons"""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        self.assertGreater(rows["cb/gate_r3/probe.py"]["mentioned_by"], 0)
        self.assertGreater(rows["run12/gen_item_icons.py"]["mentioned_by"], 0)
        self.assertNotIn("run12/gen_item_icons.py", {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)})

    def test_package_and_relative_imports_protect_the_module(self):
        write(self.root, "cb/tools/main.py", '"""main.py: tool."""\nfrom lib.util import f\nfrom .rel import g\n')
        write(self.root, "cb/tools/lib/util.py", '"""util.py: same bytes."""\n')
        write(self.root, "cb/common/util.py", '"""util.py: same bytes."""\n')
        write(self.root, "cb/gate_r7/rel.py", '"""rel.py: imported relatively."""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
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

    def test_multiline_and_js_and_dash_m_imports_count(self):
        self.assertEqual(inventory.imported_names("from tools import (\n    room_util,\n)\n"), {"tools", "room_util"})
        self.assertIn("pkg_mod", inventory.imported_names("python3 -m tools.pkg_mod --x\n"))
        self.assertTrue({"util.js", "util.mjs"} <= inventory.js_imported_files("const u = require('../lib/util')\n"))
        write(self.root, "web/app.js", "const u = require('../old/r1/jsutil')\n")
        write(self.root, "old/r1/jsutil.js", "module.exports = 1\n")
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        self.assertGreater(rows["old/r1/jsutil.js"]["mentioned_by"], 0)

    def test_new_script_elsewhere_naming_a_candidate_keeps_it(self):
        rows = list(self.rows.values())
        moves = archive.plan(rows, self.root)
        write(self.root, "cb/late/user.py", '"""user.py"""\nimport probe\n', old=False)
        rep = cxylib.Report(out=io.StringIO())
        archive.apply(moves, self.root, os.path.join(self.root, "_archive", "t"), rep, rows=rows, since=OLD + 3600)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/gate_r3/probe.py")))

    def test_archive_refuses_example_registry(self):
        env = dict(os.environ, CXY_REGISTRY=os.path.join(self.root, "registry.example.json"))
        write(self.root, "registry.example.json", '{"x": {"runner": "py", "path": "nope.py", "help": "x"}}')
        out = subprocess.run([sys.executable, os.path.join(CXY, "cxy.py"), "archive", "--root", self.root],
                             capture_output=True, text=True, env=env)
        self.assertEqual(out.returncode, 1)
        self.assertIn("registry", out.stdout)

    def test_page_in_the_same_folder_keeps_its_script(self):
        write(self.root, "web/v2/index.html", '<script src="game.js"></script>\n')
        write(self.root, "web/v2/game.js", "console.log(1)\n")
        write(self.root, "bin/run.bat", "python ..\\old\\r3\\job_tool.py\n")
        write(self.root, "old/r3/job_tool.py", '"""job_tool.py: called by a bat."""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertNotIn("web/v2/game.js", moves)
        self.assertNotIn("old/r3/job_tool.py", moves)

    def test_package_markers_and_extensionless_callers(self):
        write(self.root, "pkga/__init__.py", "")
        write(self.root, "pkgb/__init__.py", "")
        write(self.root, "Makefile", "build:\n\tpython w/old_tool.py\n")
        write(self.root, "w/old_tool.py", '"""old_tool.py"""\n')
        write(self.root, "ci/run.yml", "run: python -m tools.ci_step\n")
        write(self.root, "tools/v3/ci_step.py", '"""ci_step.py"""\n')
        write(self.root, "ui/App.vue", "import x from '../lib/r1/vue_helper'\n")
        write(self.root, "lib/r1/vue_helper.js", "export default 1\n")
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        for kept in ("pkga/__init__.py", "pkgb/__init__.py", "w/old_tool.py", "tools/v3/ci_step.py", "lib/r1/vue_helper.js"):
            self.assertNotIn(kept, moves)

    def test_blender_addon_copy_stays(self):
        write(self.root, "cb/tools/io_game.py", 'bl_info = {"name": "io"}\ndef register():\n    pass\n')
        write(self.root, "blender/addons/io_game.py", 'bl_info = {"name": "io"}\ndef register():\n    pass\n')
        write(self.root, "blender/startup/boot.py", "print(1)\n")
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertNotIn("blender/addons/io_game.py", moves)
        self.assertNotIn("blender/startup/boot.py", moves)

    def test_late_check_sees_copied_files_with_old_mtime(self):
        rows = list(self.rows.values())
        moves = archive.plan(rows, self.root)
        write(self.root, "cb/synced/caller.py", "import probe\n")   # old mtime (like rsync -a), fresh ctime
        rep = cxylib.Report(out=io.StringIO())
        archive.apply(moves, self.root, os.path.join(self.root, "_archive", "t"), rep, rows=rows, since=time.time() - 60)
        self.assertTrue(os.path.exists(os.path.join(self.root, "cb/gate_r3/probe.py")))

    def test_kept_file_keeps_its_imports(self):
        write(self.root, "rounds/run12/oldbake.py", '"""oldbake.py"""\nimport bake_util\n')
        write(self.root, "rounds/run12/bake_util.py", '"""bake_util.py"""\n')
        rows = list(inventory.build(self.root, self.reg, rules=RULES))
        moves = archive.plan(rows, self.root)
        self.assertIn("rounds/run12/bake_util.py", {r["path"] for r, _ in moves})
        write(self.root, "tools/run.sh", "python3 rounds/run12/oldbake.py\n", old=False)   # a caller appears later
        rep = cxylib.Report(out=io.StringIO())
        archive.apply(moves, self.root, os.path.join(self.root, "_archive", "t"), rep, rows=rows, since=time.time() - 60)
        self.assertTrue(os.path.exists(os.path.join(self.root, "rounds/run12/oldbake.py")))
        self.assertTrue(os.path.exists(os.path.join(self.root, "rounds/run12/bake_util.py")))

    def test_failed_move_rolls_back_the_run(self):
        rows = list(self.rows.values())
        moves = archive.plan(rows, self.root)
        calls = {"n": 0}
        orig = archive.shutil.move

        def flaky(a, b):
            calls["n"] += 1
            if calls["n"] == 3:
                raise OSError("disk full")
            return orig(a, b)
        archive.shutil.move = flaky
        try:
            n = archive.apply(moves, self.root, os.path.join(self.root, "_archive", "t"), cxylib.Report(out=io.StringIO()), rows=rows)
        finally:
            archive.shutil.move = orig
        self.assertEqual(n, 0)
        for r, _ in moves:
            self.assertTrue(os.path.exists(os.path.join(self.root, r["path"])), r["path"])

    def test_pytest_files_stay(self):
        write(self.root, "tests/test_rigging/test_bones.py", "def test_x():\n    pass\n")
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        self.assertTrue(rows["tests/test_rigging/test_bones.py"]["protect"])

    def test_callers_inside_strings_folder_imports_and_same_name(self):
        write(self.root, "tools2/bake_all.bat", 'blender -b x.blend --python-expr "import sys; import bake_lod; bake_lod.main()"\n')
        write(self.root, "run12/bake_lod.py", '"""bake_lod.py"""\n')
        write(self.root, "run10/main.js", "const l = require('./lib')\n")
        write(self.root, "run10/lib/index.js", "module.exports = 1\n")
        write(self.root, "export/run.py", 'import subprocess; subprocess.run(["py", "../run11/run.py"])\n')
        write(self.root, "run11/run.py", '"""run.py: the old runner."""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        for rel in ("run12/bake_lod.py", "run10/lib/index.js", "run11/run.py"):
            self.assertGreater(rows[rel]["mentioned_by"], 0, rel)

    def test_same_named_wrapper_importing_by_dotted_path(self):
        write(self.root, "pipeline/bake.py", '"""bake.py: thin wrapper."""\nfrom run13.bake import main\n')
        write(self.root, "run13/bake.py", '"""bake.py: the real one."""\ndef main(): pass\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        self.assertGreater(rows["run13/bake.py"]["mentioned_by"], 0)

    def test_utf16_big_and_digit_named_callers(self):
        p = os.path.join(self.root, "win/go.ps1")
        os.makedirs(os.path.dirname(p))
        with open(p, "wb") as f:
            f.write("python run12\\bake_hair.py\r\n".encode("utf-16"))   # BOM + UTF-16LE, like PowerShell 5
        write(self.root, "run12/bake_hair.py", '"""bake_hair.py"""\n')
        write(self.root, "nb/a.ipynb", '{"cells": ["import rigfix"], "img": "' + "A" * 2_500_000 + '"}')
        write(self.root, "old9/rigfix.py", '"""rigfix.py"""\n')
        write(self.root, "cfg/steps.json", '{"steps": ["01_import"]}')
        write(self.root, "steps9/01_import.py", '"""01_import.py"""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        for rel in ("run12/bake_hair.py", "old9/rigfix.py", "steps9/01_import.py"):
            self.assertGreater(rows[rel]["mentioned_by"], 0, rel)

    def test_batch_dir_and_case_insensitive_callers(self):
        write(self.root, "run13/go.bat", 'blender -b a.blend -P "%~dp0bake_job.py"\r\n')
        write(self.root, "run13/bake_job.py", '"""bake_job.py"""\n')
        write(self.root, "RUN.BAT", "python run14\\bake.py\r\n")
        write(self.root, "run14/Bake.py", '"""Bake.py"""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        self.assertGreater(rows["run14/Bake.py"]["mentioned_by"], 0)
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertNotIn("run13/bake_job.py", moves)
        self.assertNotIn("run14/Bake.py", moves)

    def test_copied_in_job_folder_counts_by_ctime(self):
        write(self.root, "cb/out/run0/build.py", '"""build.py: unzipped today, old mtime."""\n')   # ctime = now
        inventory.touched = REAL_TOUCHED
        try:
            rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        finally:
            inventory.touched = lambda st: st.st_mtime
        self.assertLess(rows["cb/out/run0/build.py"]["age_h"], 1)
        self.assertNotEqual(rows["cb/out/run0/build.py"]["status"], "dead")
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertNotIn("cb/out/run0/build.py", moves)

    def test_spaced_names_hooks_uploads_and_plain_duplicates(self):
        write(self.root, "tools/go.bat", 'python "%~dp0..\\run10\\fix rig.py"\r\n')
        write(self.root, "run10/fix rig.py", '"""fix rig"""\n')
        write(self.root, ".git/hooks/pre-commit", "#!/bin/sh\npython run10/val.py\n")
        write(self.root, "run10/val.py", '"""val"""\n')
        write(self.root, "uploads/run.bat", "python tools2\\dupb.py\r\n")
        write(self.root, "tools1/dupa.py", '"""same bytes"""\nx = 1\n')
        write(self.root, "tools2/dupb.py", '"""same bytes"""\nx = 1\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        for rel in ("run10/fix rig.py", "run10/val.py", "tools2/dupb.py"):
            self.assertGreater(rows[rel]["mentioned_by"], 0, rel)
        self.assertEqual(rows["tools1/dupa.py"]["status"], "duplicate")
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertFalse(moves & {"run10/fix rig.py", "run10/val.py", "tools1/dupa.py", "tools2/dupb.py"}, moves)

    def test_copy_named_script_with_sibling_caller_stays(self):
        write(self.root, "run10/go.bat", 'python "%~dp0bake (2).py"\r\n')
        write(self.root, "run10/bake (2).py", '"""copy"""\n')
        rows = {r["path"]: r for r in inventory.build(self.root, self.reg, rules=RULES)}
        moves = {r["path"] for r, _ in archive.plan(list(rows.values()), self.root)}
        self.assertNotIn("run10/bake (2).py", moves)
        late = [("x/new.bat", 'python ..\\run10\\bake (2).py')]
        self.assertTrue(archive.stem_re("bake (2).py").search(late[0][1]))

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
