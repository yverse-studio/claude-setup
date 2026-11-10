"""archive: move dead and duplicate scripts into _archive/<date>-scripts/ (never deletes), with an undo manifest.

Safety rules (a file stays where it is if any is true):
  - status is not dead/duplicate (canonical, helper, used, active, one-off, unknown always stay)
  - a sibling in the same folder that stays imports or names it (moving would break the sibling)
  - the file changed since the inventory was taken (sha differs)
"""
import csv
import os
import re
import shutil

from cxylib import sha256

MOVE_STATUS = ("dead", "duplicate")


def plan(rows, root):
    """Rows that may move: list of (row, reason)."""
    cand = {r["path"] for r in rows if r["status"] in MOVE_STATUS and not r.get("protect")}
    by_dir = {}
    for r in rows:
        by_dir.setdefault(os.path.dirname(r["path"]), []).append(r)
    out = []
    for r in rows:
        if r["path"] not in cand:
            continue
        stem = os.path.splitext(r["name"])[0]
        pat = re.compile(r"\b" + re.escape(stem) + r"\b")
        blocked = None
        for sib in by_dir[os.path.dirname(r["path"])]:
            if sib["path"] in cand or sib is r:
                continue
            try:
                with open(os.path.join(root, sib["path"]), encoding="utf-8", errors="replace") as fh:
                    if pat.search(fh.read()):
                        blocked = sib["path"]
                        break
            except OSError:
                continue
        if blocked:
            continue
        if r.get("keeper"):
            reason = ("duplicate of " if r["status"] == "duplicate" else "superseded by ") + r["keeper"]
        else:
            reason = "dead (old round, nobody names it)"
        out.append((r, reason))
    return out


def apply(moves, root, dest, report):
    """Move files; write dest/MANIFEST.tsv (original, archived, sha16, reason). Returns number moved."""
    os.makedirs(dest, exist_ok=True)
    man = os.path.join(dest, "MANIFEST.tsv")
    new = not os.path.exists(man)
    n = 0
    with open(man, "a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, delimiter="\t")
        if new:
            w.writerow(["original", "archived", "sha16", "reason"])
        for r, reason in moves:
            src = os.path.join(root, r["path"])
            if not os.path.exists(src):
                report.warn(f"gone already: {r['path']}")
                continue
            if sha256(src)[:16] != r["sha"]:
                report.warn(f"changed since inventory, kept: {r['path']}")
                continue
            dst = os.path.join(dest, r["path"])
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.move(src, dst)
            w.writerow([r["path"], os.path.relpath(dst, root), r["sha"], reason])
            n += 1
    report.ok(f"moved {n} scripts to {os.path.relpath(dest, root)} (manifest MANIFEST.tsv)")
    return n


def undo(manifest, root, report):
    """Move every file in a MANIFEST.tsv back to where it came from."""
    n = 0
    with open(manifest, encoding="utf-8") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            src, dst = os.path.join(root, row["archived"]), os.path.join(root, row["original"])
            if os.path.exists(dst):
                report.red(f"target exists, not overwritten: {row['original']}")
                continue
            if not os.path.exists(src):
                report.warn(f"archived file missing: {row['archived']}")
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.move(src, dst)
            n += 1
    report.ok(f"restored {n} scripts")
    return n
