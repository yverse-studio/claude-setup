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

    listing = {}

    def folder_texts(d):
        if d not in listing:
            from inventory import TEXT_EXT
            try:
                listing[d] = [os.path.join(d, f) for f in os.listdir(os.path.join(root, d) if d else root)
                              if f.endswith(TEXT_EXT) and not f.startswith("INVENTORY")]
            except OSError:
                listing[d] = []
        return listing[d]

    changed = True
    while changed:
        changed = False
        for r in rows:
            if r["path"] not in cand:
                continue
            pat = re.compile(r"\b" + re.escape(os.path.splitext(r["name"])[0]) + r"\b")
            d = os.path.dirname(r["path"])
            # staying siblings: script rows not moving, plus every other text file in the folder (html, bat, yml, ...)
            sibs = [sib["path"] for sib in by_dir[d] if sib is not r and sib["path"] not in cand]
            sibs += [rel for rel in folder_texts(d) if rel not in cand and rel != r["path"] and rel not in sibs]
            if any(pat.search(text(rel)) for rel in sibs):
                cand.discard(r["path"])
                changed = True
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


SCRIPT_EXT = (".py", ".mjs", ".js", ".sh", ".ps1")


def _late_mentions(root, since, skip_dirs=("node_modules", "__pycache__", ".git", "_archive", "uploads")):
    """Text of every script or doc changed after `since` (the inventory time): they may name a candidate now."""
    from inventory import TEXT_EXT, _read
    out = []
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in skip_dirs]
        for f in files:
            p = os.path.join(d, f)
            if f.endswith(TEXT_EXT) and not f.startswith("INVENTORY"):
                try:
                    if os.path.getmtime(p) > since:
                        out.append((p, _read(p)))
                except OSError:
                    continue
    return out


def apply(moves, root, dest, report, rows=None, since=None):
    """Move files; write dest/MANIFEST.tsv (original, archived, sha16, reason). Returns number moved."""
    inventoried = {}
    for r in (rows if rows is not None else [m[0] for m in moves]):
        inventoried.setdefault(os.path.dirname(r["path"]), set()).add(r["path"])
    os.makedirs(dest, exist_ok=True)
    man = os.path.join(dest, "MANIFEST.tsv")
    new = not os.path.exists(man)
    n = 0
    with open(man, "a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, delimiter="\t")
        if new:
            w.writerow(["original", "archived", "sha16", "reason", "root"])
        known = {}
        for r, _ in moves:
            known.setdefault(os.path.dirname(r["path"]), set())
        listed = {}
        for d in known:
            try:
                listed[d] = {os.path.join(d, f) for f in os.listdir(os.path.join(root, d)) if f.endswith(SCRIPT_EXT)}
            except OSError:
                listed[d] = set()
        late = _late_mentions(root, since) if since else []
        for r, reason in moves:
            src = os.path.join(root, r["path"])
            d = os.path.dirname(r["path"])
            stem = re.escape(os.path.splitext(r["name"])[0])
            hit = next((p for p, t in late if os.path.abspath(p) != os.path.abspath(src) and re.search(r"\b" + stem + r"\b", t)), None)
            if hit:
                report.warn(f"kept {r['path']}: named by {os.path.relpath(hit, root)}, changed after the inventory")
                continue
            new_files = listed[d] - inventoried.get(d, set())
            if new_files:
                report.warn(f"kept {r['path']}: its folder has scripts newer than the inventory ({', '.join(sorted(new_files))[:120]})")
                continue
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
            # manifest row first: a moved file is always recorded, so undo can bring it back
            w.writerow([r["path"], os.path.relpath(dst, root), r["sha"], reason, os.path.abspath(root)])
            fh.flush()
            os.fsync(fh.fileno())
            try:
                shutil.move(src, dst)
            except OSError as e:
                report.red(f"move failed, file stays: {r['path']} ({e})")
                continue
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
