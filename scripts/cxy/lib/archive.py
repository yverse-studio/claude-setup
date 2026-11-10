"""archive: move dead and duplicate scripts into _archive/<date>-scripts/ (never deletes), with an undo manifest.

Safety rules (a file stays where it is if any is true):
  - status is not dead/duplicate (canonical, helper, used, active, one-off, unknown always stay)
  - any file outside its folder names it (mentioned_by > 0)
  - a sibling in the same folder that stays imports or names it, transitively (moving would break the sibling)
  - the file changed since the reviewed INVENTORY.json was written (sha differs)
  - a file with that path is already in the archive (never overwritten)
"""
import csv
import os
import re
import shutil

from cxylib import sha256

MOVE_STATUS = ("dead", "duplicate")


def plan(rows, root):
    """Rows that may move: list of (row, reason). A candidate that a staying sibling names stays too,
    repeated until nothing changes (A imported by B, B kept because C imports it -> A stays)."""
    cand = {r["path"] for r in rows if r["status"] in MOVE_STATUS and not r.get("protect") and not r.get("mentioned_by")}
    by_dir = {}
    for r in rows:
        by_dir.setdefault(os.path.dirname(r["path"]), []).append(r)
    texts = {}

    def text(rel):
        if rel not in texts:
            try:
                with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as fh:
                    texts[rel] = fh.read()
            except OSError:
                texts[rel] = ""
        return texts[rel]

    changed = True
    while changed:
        changed = False
        for r in rows:
            if r["path"] not in cand:
                continue
            pat = re.compile(r"\b" + re.escape(os.path.splitext(r["name"])[0]) + r"\b")
            for sib in by_dir[os.path.dirname(r["path"])]:
                if sib is not r and sib["path"] not in cand and pat.search(text(sib["path"])):
                    cand.discard(r["path"])
                    changed = True
                    break
    out = []
    for r in rows:
        if r["path"] not in cand:
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
            w.writerow(["original", "archived", "sha16", "reason", "root"])
        for r, reason in moves:
            src = os.path.join(root, r["path"])
            if not os.path.exists(src):
                report.warn(f"gone already: {r['path']}")
                continue
            if sha256(src)[:16] != r["sha"]:
                report.warn(f"changed since inventory, kept: {r['path']}")
                continue
            dst = os.path.join(dest, r["path"])
            if os.path.lexists(dst):
                report.red(f"already in the archive, not overwritten: {r['path']}")
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.move(src, dst)
            w.writerow([r["path"], os.path.relpath(dst, root), r["sha"], reason, os.path.abspath(root)])
            n += 1
    report.ok(f"moved {n} scripts to {os.path.relpath(dest, root)} (manifest MANIFEST.tsv)")
    return n


def undo(manifest, root, report):
    """Move every file in a MANIFEST.tsv back to where it came from (the root written in the manifest wins)."""
    n = 0
    with open(manifest, encoding="utf-8") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            base = row.get("root") or root
            src, dst = os.path.join(base, row["archived"]), os.path.join(base, row["original"])
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
