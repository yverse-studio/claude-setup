#!/usr/bin/env python3
"""cxy: the ONE entry point for the GameDev pipeline tools (cloud). Plain python3, no bpy needed to start.

  python3 cxy.py list                         every command, its PIPELINE step and the script it runs
  python3 cxy.py doctor                       scripts exist, Blender 5.2.3 / bpy python found, PIPELINE paths OK
  python3 cxy.py inventory [--root DIR] [--out FILE.md]    what every script is (canonical/helper/used/active/one-off/duplicate/dead)
  python3 cxy.py archive [--apply] [--root DIR]            dead + duplicate scripts -> _archive/<date>-scripts/ (dry run writes
                                                           ARCHIVE-PLAN.json to review; --apply moves only that list)
  python3 cxy.py archive --undo <MANIFEST.tsv>             put them back
  python3 cxy.py <command> [--cxy-dry] [--cxy-factory] <args...>   run a pipeline tool (see `list`)

Runners: py = system python3; bpy = $CXY_BPY (default /tmp/bpyenv/bin/python) -I; blender = $CXY_BLENDER
(default /opt/blender/blender-5.2.3-linux-x64/blender) -b <first arg> [--factory-startup] -P <script> -- <rest>.
Every run ends with one line `RESULT PASS` or `RESULT RED (...)`; exit 0 / 1 (the tool's own exit code is passed on).
The tools themselves are not changed: their old paths keep working for threads that call them directly.
Docs: ../PIPELINE.md section 2, README.md next to this file.
"""
import datetime
import json
import os
import shlex
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))

import cxylib
from cxylib import Report

REGISTRY_FILE = os.environ.get("CXY_REGISTRY") or next(
    (p for p in (os.path.join(HERE, "registry.json"), os.path.join(HERE, "registry.example.json")) if os.path.isfile(p)),
    os.path.join(HERE, "registry.json"))


def load_registry(path=None):
    with open(path or REGISTRY_FILE, encoding="utf-8") as fh:
        reg = json.load(fh)
    return {k: v for k, v in reg.items() if not k.startswith("_")}


def build_argv(entry, args, root=None, factory=False):
    """The exact command line a registry entry runs with (pure, testable)."""
    root = root or cxylib.PF_ROOT
    script = os.path.join(root, entry["path"])
    runner = entry["runner"]
    if runner == "py":
        return [sys.executable or "python3", script, *args]
    if runner == "bpy":
        return [cxylib.bpy_python(), "-I", script, *args]
    if runner == "blender":
        if not args:
            raise SystemExit(f"usage: cxy <cmd> <file.blend> [args...]  (blender runner needs the .blend first)")
        blend, rest = args[0], list(args[1:])
        if rest and rest[0] == "--":
            rest = rest[1:]
        cmd = [cxylib.blender_exe(), "-b", blend]
        if factory or entry.get("factory"):
            cmd.append("--factory-startup")
        return cmd + ["-P", script, "--", *rest]
    if runner == "node":
        return ["node", script, *args]
    raise SystemExit(f"unknown runner {runner!r}")


def cmd_list(reg):
    w = max(len(k) for k in reg)
    for k, e in sorted(reg.items(), key=lambda kv: (kv[1].get("step", "z"), kv[0])):
        print(f"{k:<{w}}  [{e.get('step', '-'):>3}] {e['runner']:<7} {e['help']}")
        print(f"{'':<{w}}        -> {e['path']}")
    return 0


def cmd_doctor(reg, root=None):
    root = root or cxylib.PF_ROOT
    rep = Report()
    for k, e in sorted(reg.items()):
        p = os.path.join(root, e["path"])
        (rep.ok if os.path.isfile(p) else rep.red)(f"{k}: {e['path']}")
    runners = {e["runner"] for e in reg.values()}
    if "blender" in runners:
        b = cxylib.blender_exe()
        if os.path.isfile(b):
            rep.ok(f"blender {b}")
        else:
            rep.warn(f"blender not found at {b} (set CXY_BLENDER; laptop: StudioLibrary\\BLENDER_EXE.txt)")
    if "bpy" in runners:
        py = cxylib.bpy_python()
        (rep.ok if os.path.isfile(py) else rep.warn)(f"bpy python {py}" + ("" if os.path.isfile(py) else
                                                       " missing (python3 rooms/tools/room.py setup installs it)"))
    pc = os.path.join(cxylib.CLOUD_BLENDER, "pipeline_check.py")
    if os.path.isfile(pc):
        r = subprocess.run([sys.executable, pc], capture_output=True, text=True)
        (rep.ok if r.returncode == 0 else rep.red)("pipeline_check: " + (r.stdout.strip().splitlines() or ["?"])[-1])
    return rep.finish()


def cmd_inventory(reg, argv):
    import inventory
    root = _opt(argv, "--root", cxylib.PF_ROOT)
    out = _opt(argv, "--out", os.path.join(HERE, "INVENTORY.md"))
    stem = os.path.splitext(out)[0]
    rows = inventory.build(root, reg, skip=[out, stem + ".json", stem + ".json.root"])   # a rerun never reads its own output
    inventory.save(rows, out, stem + ".json")
    with open(os.path.splitext(out)[0] + ".json.root", "w", encoding="utf-8") as fh:
        fh.write(os.path.abspath(root))
    rep = Report()
    from collections import Counter
    for s, n in sorted(Counter(r["status"] for r in rows).items()):
        rep.ok(f"{s}: {n}")
    rep.ok(f"written {out}")
    return rep.finish()


def cmd_archive(reg, argv):
    """Dry run: fresh inventory -> ARCHIVE-PLAN.json + the move list. --apply: moves exactly what the saved
    ARCHIVE-PLAN.json (the reviewed one) lists, refuses when it is missing, older than 12 h, from another root, or
    not the file this dry run wrote (sha in .started; `cxy inventory` writes INVENTORY.* and never touches it)."""
    import archive
    import inventory
    root = os.path.abspath(_opt(argv, "--root", cxylib.PF_ROOT))
    inv_json = _opt(argv, "--inventory", os.path.join(HERE, "ARCHIVE-PLAN.json"))
    rep = Report()
    undo = _opt(argv, "--undo", None)
    if undo:
        archive.undo(undo, root, rep)
        return rep.finish()
    dest = _opt(argv, "--dest", os.path.join(root, "_archive", f"{datetime.date.today():%Y-%m-%d}-scripts"))
    # without the project's own registry the real tools are not known as canonical: never archive then
    if os.path.basename(REGISTRY_FILE).startswith("registry.example") or os.environ.get("CXY_REGISTRY", "").endswith(".example.json") \
            or not any(os.path.isfile(os.path.join(root, e["path"])) for e in reg.values()):
        rep.red(f"no project registry ({REGISTRY_FILE}) or none of its scripts exist under {root}: copy registry.example.json "
                "to registry.json and register the real tools first")
        return rep.finish()
    if "--apply" not in argv:
        started = time.time()   # texts are read after this moment: --apply rescans everything changed since
        own_files = [inv_json, inv_json + ".root", inv_json + ".started", os.path.splitext(inv_json)[0] + ".md"]
        rows = inventory.build(root, reg, skip=own_files)
        inventory.save(rows, os.path.splitext(inv_json)[0] + ".md", inv_json)
        with open(inv_json + ".root", "w", encoding="utf-8") as fh:
            fh.write(root)
        with open(inv_json + ".started", "w", encoding="utf-8") as fh:
            fh.write(f"{started!r}\n{cxylib.sha256(inv_json)}\n")
        moves = archive.plan(rows, root)
        with open(inv_json + ".started", "a", encoding="utf-8") as fh:   # the printed list: --apply moves only these
            fh.writelines(r["path"] + "\n" for r, _ in moves)
        for r, reason in moves:
            print(f"MOVE {r['path']}  ({reason})")
        rep.ok(f"dry run: {len(moves)} scripts would move to {dest}; review, then add --apply (uses {inv_json})")
        return rep.finish()
    if not os.path.isfile(inv_json) or time.time() - os.path.getmtime(inv_json) > 12 * 3600:
        rep.red(f"no reviewed inventory younger than 12 h at {inv_json}: run `cxy archive` (dry) first")
        return rep.finish()
    saved_root = open(inv_json + ".root", encoding="utf-8").read().strip() if os.path.isfile(inv_json + ".root") else ""
    if saved_root != root:
        rep.red(f"inventory was taken for root {saved_root or '?'}, not {root}: run `cxy archive --root {root}` (dry) first")
        return rep.finish()
    with open(inv_json, encoding="utf-8") as fh:
        rows = json.load(fh)
    try:
        lines = open(inv_json + ".started", encoding="utf-8").read().splitlines()
        since, sha, printed = float(lines[0]), lines[1].strip(), set(lines[2:])
    except (OSError, ValueError, IndexError):
        since, sha, printed = None, None, set()
    if since is None or sha != cxylib.sha256(inv_json):
        rep.red(f"{inv_json} is not the list the last `cxy archive` dry run printed (rewritten since): run the dry run again")
        return rep.finish()
    own = [inv_json, inv_json + ".root", inv_json + ".started", os.path.splitext(inv_json)[0] + ".md"]
    # exactly the printed list, and only what a fresh scan right now would still move
    moves = [(r, why) for r, why in archive.plan(rows, root) if r["path"] in printed]
    fresh = {r["path"] for r, _ in archive.plan(inventory.build(root, reg, skip=own), root)}
    kept = {r["path"]: "a fresh scan no longer lists it (new caller, change or protection)" for r, _ in moves
            if r["path"] not in fresh}
    archive.apply(moves, root, dest, rep, rows=rows, since=since, exclude=own, kept=kept)
    return rep.finish()


def cmd_run(name, entry, argv):
    # cxy's own flags carry a cxy- prefix so they never clash with a tool's flags (clip_fix/assemble have --dry)
    dry = "--cxy-dry" in argv
    factory = "--cxy-factory" in argv
    args = [a for a in argv if a not in ("--cxy-dry", "--cxy-factory")]
    cmd = build_argv(entry, args, factory=factory)
    cwd = os.path.join(cxylib.PF_ROOT, entry["cwd"]) if entry.get("cwd") else None
    print("RUN  " + " ".join(shlex.quote(c) for c in cmd) + (f"   (cwd {cwd})" if cwd else ""), flush=True)
    if dry:
        print("RESULT PASS (dry run, nothing started)")
        return 0
    if not os.path.isfile(cmd[0]) and os.sep in cmd[0]:
        print(f"RED  runner not found: {cmd[0]} (cxy doctor)")
        print("RESULT RED (1 red, 0 warn, 0 ok)")
        return 1
    code = subprocess.call(cmd, cwd=cwd)
    if code == 0:
        print(f"RESULT PASS ({name} exit 0)")
    else:
        print(f"RESULT RED ({name} exit {code})")
    return 0 if code == 0 else 1


def _opt(argv, flag, default):
    if flag in argv:
        i = argv.index(flag)
        if i + 1 < len(argv):
            return argv[i + 1]
    return default


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    reg = load_registry()
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    if cmd == "list":
        return cmd_list(reg)
    if cmd == "doctor":
        return cmd_doctor(reg)
    if cmd == "inventory":
        return cmd_inventory(reg, rest)
    if cmd == "archive":
        return cmd_archive(reg, rest)
    if cmd in reg:
        return cmd_run(cmd, reg[cmd], rest)
    print(f"RED  unknown command {cmd!r}; `python3 cxy.py list` shows all")
    print("RESULT RED (1 red, 0 warn, 0 ok)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
