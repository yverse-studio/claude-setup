"""archive: move dead and duplicate scripts into _archive/<date>-scripts/ (never deletes), with an undo manifest.

Safety rules (a file stays where it is if any is true):
  - status is not dead/duplicate (canonical, helper, used, active, one-off, unknown always stay)
  - a duplicate outside a round or archived folder (run12/, gate_r3/, _withdrawn/ ...): listed for a human, never moved
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
from inventory import ARCHIVED_RE, ROUND_RE

MOVE_STATUS = ("dead", "duplicate")


def plan(rows, root):
    """Rows that may move: list of (row, reason). A candidate that a staying sibling names stays too,
    repeated until nothing changes (A imported by B, B kept because C imports it -> A stays)."""
    cand = {r["path"] for r in rows if r["status"] in MOVE_STATUS and not r.get("protect") and not r.get("mentioned_by")
            and (r["status"] == "dead" or ROUND_RE.search(r["path"]) or ARCHIVED_RE.search(r["path"]))}
    by_dir = {}
    for r in rows:
        by_dir.setdefault(os.path.dirname(r["path"]), []).append(r)
    texts = {}

    def text(rel):
        if rel not in texts:
            from inventory import _read, scan_text
            texts[rel] = scan_text(_read(os.path.join(root, rel)))   # UTF-16 aware
        return texts[rel]

    listing = {}

    def folder_texts(d):
        if d not in listing:
            from inventory import BINARY_EXT
            try:
                listing[d] = [os.path.join(d, f) for f in os.listdir(os.path.join(root, d) if d else root)
                              if not f.lower().endswith(BINARY_EXT) and not f.startswith("INVENTORY")
                              and os.path.isfile(os.path.join(root, d, f))]
            except OSError:
                listing[d] = []
        return listing[d]

    changed = True
    while changed:
        changed = False
        for r in rows:
            if r["path"] not in cand:
                continue
            pat = re.compile(r"\b" + re.escape(os.path.splitext(r["name"])[0].casefold()) + r"\b")
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


def _late_mentions(root, since, exclude=()):
    """Text of every script or doc changed after `since` (the inventory time): they may name a candidate now."""
    from inventory import walk_text, _read, scan_text
    out = []
    skip = {os.path.abspath(x) for x in exclude}
    for p in walk_text(root):
        if os.path.abspath(p) in skip:
            continue
        try:
            st = os.stat(p)
            if max(st.st_mtime, st.st_ctime) > since:   # ctime too: rsync -a / cp -p / unzip keep old mtimes
                out.append((p, scan_text(_read(p))))
        except OSError:
            continue
    return out


def _keep_reason(r, root, dest, late, listed, inventoried):
    """Why a planned file must stay after all ('' = it may move). Checked at --apply time."""
    src = os.path.join(root, r["path"])
    d = os.path.dirname(r["path"])
    stem = re.escape(os.path.splitext(r["name"])[0].casefold())
    hit = next((p for p, t in late if os.path.abspath(p) != os.path.abspath(src) and re.search(r"\b" + stem + r"\b", t)), None)
    if hit:
        return f"named by {os.path.relpath(hit, root)}, changed after the inventory"
    new_files = listed.get(d, set()) - inventoried.get(d, set())
    if new_files:
        return f"its folder has scripts newer than the inventory ({', '.join(sorted(new_files))[:120]})"
    if not os.path.exists(src):
        return "gone already"
    if sha256(src)[:16] != r["sha"]:
        return "changed since the inventory"
    if os.path.lexists(os.path.join(dest, r["path"])):
        return "already in the archive (never overwritten)"
    return ""


def apply(moves, root, dest, report, rows=None, since=None, exclude=()):
    """1. check every planned file again (late callers, new scripts, sha, archive collision);
    2. re-plan with the kept files as staying, so a kept file keeps its imports too (repeat until stable);
    3. move, manifest row first; if any move fails, every move of this run is rolled back.
    Writes dest/MANIFEST.tsv (original, archived, sha16, reason, root). Returns number moved."""
    rows = rows if rows is not None else [m[0] for m in moves]
    inventoried = {}
    for r in rows:
        inventoried.setdefault(os.path.dirname(r["path"]), set()).add(r["path"])
    listed = {}
    for r, _ in moves:
        d = os.path.dirname(r["path"])
        if d not in listed:
            try:
                listed[d] = {os.path.join(d, f) for f in os.listdir(os.path.join(root, d)) if f.endswith(SCRIPT_EXT)}
            except OSError:
                listed[d] = set()
    late = _late_mentions(root, since, exclude) if since else []   # exclude: our own inventory files

    kept = {}
    while True:
        for r, _ in moves:
            if r["path"] not in kept:
                why = _keep_reason(r, root, dest, late, listed, inventoried)
                if why:
                    kept[r["path"]] = why
        staying = [dict(r, protect=f"kept at apply: {kept[r['path']]}") if r["path"] in kept else r for r in rows]
        replanned = plan(staying, root)
        allowed = {r["path"] for r, _ in replanned}
        dropped = [r for r, _ in moves if r["path"] not in allowed and r["path"] not in kept]
        for r in dropped:
            kept[r["path"]] = "a kept file in its folder names it"
        moves = [(r, why) for r, why in moves if r["path"] in allowed]
        if not dropped:
            break
    for path, why in sorted(kept.items()):
        (report.red if why.startswith("already in the archive") else report.warn)(f"kept {path}: {why}")

    os.makedirs(dest, exist_ok=True)
    man = os.path.join(dest, "MANIFEST.tsv")
    new = not os.path.exists(man)
    done = []
    with open(man, "a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, delimiter="\t")
        if new:
            w.writerow(["original", "archived", "sha16", "reason", "root"])
        for r, reason in moves:
            src, dst = os.path.join(root, r["path"]), os.path.join(dest, r["path"])
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            # manifest row first: a moved file is always recorded, so undo can bring it back
            w.writerow([r["path"], os.path.relpath(dst, root), r["sha"], reason, os.path.abspath(root)])
            fh.flush()
            os.fsync(fh.fileno())
            try:
                shutil.move(src, dst)
            except OSError as e:
                report.red(f"move failed: {r['path']} ({e}); rolling back the {len(done)} moves of this run")
                for s_, d_ in reversed(done):
                    try:
                        shutil.move(d_, s_)
                    except OSError as e2:
                        report.red(f"rollback failed, restore by MANIFEST: {os.path.relpath(s_, root)} ({e2})")
                report.ok(f"moved 0 scripts (rolled back; manifest rows of this run point at files that are back)")
                return 0
            done.append((src, dst))
    report.ok(f"moved {len(done)} scripts to {os.path.relpath(dest, root)} (manifest MANIFEST.tsv)")
    return len(done)


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
