"""inventory: list every script under a root and say what it is (canonical / helper / used / duplicate / one-off / dead).

Read-only. Classification, first match wins:
  canonical  the file a cxy command runs (registry.json)
  helper     imported or exec'd by a canonical tool, or a .py in the same tools folder as one
  duplicate  byte-identical to a file that ranks higher (canonical > helper > protected > newer); keeper named
  fork       same file name as a canonical/helper tool but different content (a job's private copy)
  used       its file name is mentioned in a doc/script/json outside its own folder
  one-off    lives in a round/gate/run/patch/lane folder and nobody names it: job history
  dead       superseded by the same script in a newer sibling round folder (run10 -> run13), or a one-off older than
             DEAD_HOURS that nobody names, or already under a _withdrawn/_superseded/_archive folder
Separately every row has `protect`: why it must never be moved (archive_rules.json: recent, running thread, proof).
  unknown    everything else (kept, listed for a human)
"""
import json
import os
import re
import time

from cxylib import sha256

SCRIPT_EXT = (".py", ".mjs", ".js", ".sh", ".ps1")
TEXT_EXT = SCRIPT_EXT + (".md", ".json", ".txt", ".tsv", ".html", ".htm", ".bat", ".cmd", ".yml", ".yaml", ".toml", ".cfg", ".ini", ".rpy")
SKIP_DIRS = {"node_modules", "__pycache__", ".git", "uploads", "_archive"}   # _archive: already archived
DEAD_HOURS = 12
ROUND_RE = re.compile(r"(^|/)(gate_?r?\d+\w*|r\d+\w*|run\d+\w*|v\d+\w*|patch\w*|lane[A-Z]\w*|build\d+|"
                      r"verdict\w*|reports?\w*|_gate\w*|gates?|stress\w*|test_\w+|clearance_repro|freeze|"
                      r"switch\d+|round\d+)(/|$)")
ARCHIVED_RE = re.compile(r"(^|/)(_withdrawn|_superseded\w*|_archive\w*|old_art|archive)(/|$)")
IMPORT_RE = re.compile(r"^\s*(?:import|from)\s+([A-Za-z_][\w]*)", re.M)
IMPORT_ANY_RE = re.compile(r"^\s*(?:from\s+(\.*[\w.]*)\s+import\s+(\([\w\s,#]*\)?|[\w ,]+)|import\s+([\w., ]+))", re.M)
JS_IMPORT_RE = re.compile(r"""(?:require\(\s*|import\s*\(\s*|from\s+|import\s+)['"]([^'"]+)['"]""")
DASH_M_RE = re.compile(r"-m\s+([\w.]+)")


def imported_names(text):
    """Every name an import statement can load as a file: dotted parts, relative parts, `from x import y` names."""
    out = set()
    for mod, names, plain in IMPORT_ANY_RE.findall(text):
        for chunk in (mod, names, plain):
            for part in re.split(r"[\s,.()]+", chunk or ""):
                if part and part != "as" and part.isidentifier():
                    out.add(part)
    for mod in DASH_M_RE.findall(text):   # python -m pkg.mod in shell scripts and docs
        out |= {p for p in mod.split(".") if p.isidentifier()}
    return out


def js_imported_files(text):
    """File names a JS module loads by a relative or bare specifier, with and without extension."""
    out = set()
    for spec in JS_IMPORT_RE.findall(text):
        base = spec.rstrip("/").split("/")[-1]
        if not base:
            continue
        stem = base.rsplit(".", 1)[0] if base.endswith((".js", ".mjs")) else base
        out |= {stem + ".js", stem + ".mjs"}
    return out
EXEC_RE = re.compile(r"""open\(\s*['"]([^'"]+\.py)['"]""")


def walk(root, exts):
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        for f in sorted(files):
            if f.endswith(exts):
                yield os.path.join(d, f)


def _read(path, limit=2_000_000):
    try:
        if os.path.getsize(path) > limit:
            return ""
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def summary_line(text):
    """First docstring or comment line, trimmed to 140 chars."""
    for line in text.splitlines()[:12]:
        s = line.strip().lstrip("#").strip().strip('"').strip("'").strip()
        if len(s) > 8 and not s.startswith(("!", "-*-", "usage", "Usage")) and not s.startswith(("import ", "from ")):
            return s[:140]
    return ""


def load_rules(path=None):
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = path or os.environ.get("CXY_RULES") or next(
        (p for p in (os.path.join(here, "archive_rules.json"), os.path.join(here, "archive_rules.example.json")) if os.path.isfile(p)), "")
    if not os.path.isfile(path):
        return {"recent_hours": 6, "protected_areas": {}, "protected_patterns": {}}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def doc_paths(root, docs):
    """Paths the proven docs name in backticks, as project-files-relative prefixes (dirs end with '/')."""
    out = {}
    for doc in docs:
        p = os.path.join(root, doc)
        base = os.path.dirname(doc)
        for tok in re.findall(r"`([^`\s]+)`", _read(p)):
            tok = tok.strip().rstrip(".,;:")
            if "/" not in tok or "\\" in tok or tok.startswith(("http", "/", "~")) or any(c in tok for c in "<>*{}"):
                continue
            for cand in (tok, os.path.normpath(os.path.join(base, tok)), "_cloud_blender/" + tok):
                is_dir = os.path.isdir(os.path.join(root, cand))
                if is_dir and len(cand.strip("/").split("/")) < 2:
                    continue   # a whole top folder (`_cloud_blender/`) is a map pointer, not a proven tool folder
                if os.path.exists(os.path.join(root, cand)):
                    out[cand.rstrip("/") + ("/" if os.path.isdir(os.path.join(root, cand)) else "")] = doc
                    break
    return out


def protection(rel, age_h, rules):
    """Why a file must not be moved ('' = it may move)."""
    if age_h < rules.get("recent_hours", 6):
        return f"changed {age_h} h ago"
    for prefix, doc in rules.get("_doc_paths", {}).items():
        if rel == prefix or (prefix.endswith("/") and rel.startswith(prefix)):
            return f"named in {doc}"
    for prefix, why in rules.get("protected_areas", {}).items():
        if rel.startswith(prefix):
            return why
    for pat, why in rules.get("protected_patterns", {}).items():
        if re.search(pat, rel):
            return why
    return ""


def build(root, registry, now=None, rules=None):
    """Return a list of row dicts, one per script under root."""
    now = now or time.time()
    rules = dict(rules if rules is not None else load_rules())
    root = os.path.abspath(root)
    rules["_doc_paths"] = doc_paths(root, rules.get("protected_docs", []))
    canonical = {os.path.normpath(os.path.join(root, e["path"])) for e in registry.values() if "path" in e}
    canonical_dirs = {os.path.dirname(p) for p in canonical}

    scripts = list(walk(root, SCRIPT_EXT))
    # our own INVENTORY.* output names every script: never count it as a mention
    texts = {p: _read(p) for p in walk(root, TEXT_EXT) if not os.path.basename(p).startswith("INVENTORY")}

    helper_names = set()
    for p in canonical:
        t = texts.get(p, "")
        helper_names |= {m + ".py" for m in IMPORT_RE.findall(t)}
        helper_names |= {os.path.basename(m) for m in EXEC_RE.findall(t)}

    base_names = {os.path.basename(p) for p in scripts}
    mentions = {b: set() for b in base_names}
    word = re.compile(r"[\w.\-]+\.(?:py|mjs|js|sh|ps1)")
    for p, t in texts.items():
        for b in set(word.findall(t)) & base_names:
            mentions[b].add(p)

    # a module any other script imports (also `from pkg.mod import`, relative, or via sys.path from another folder)
    importers = {}
    for p in set(scripts) | set(texts):
        t = texts.get(p) or _read(p)
        for n in imported_names(t) if p.endswith((".py", ".sh", ".ps1", ".md", ".txt")) else ():
            importers.setdefault(n + ".py", set()).add(p)
        for f in js_imported_files(t) if p.endswith((".js", ".mjs")) else ():
            importers.setdefault(f, set()).add(p)

    rows = []
    for p in scripts:
        rel = os.path.relpath(p, root)
        st = os.stat(p)
        text = texts.get(p) or _read(p)
        b = os.path.basename(p)
        # mentions by other files, not by its own folder and not by its own copies (same file name)
        others = {m for m in mentions.get(b, ()) if os.path.dirname(m) != os.path.dirname(p) and os.path.basename(m) != b}
        others |= {m for m in importers.get(b, ()) if os.path.basename(m) != b and os.path.dirname(m) != os.path.dirname(p)}
        age_h = round((now - st.st_mtime) / 3600, 1)
        rows.append({
            "path": rel, "name": b, "bytes": st.st_size, "lines": text.count("\n") + 1,
            "mtime": int(st.st_mtime), "age_h": age_h,
            "sha": sha256(p)[:16], "what": summary_line(text),
            "mentioned_by": len(others), "protect": protection(rel, age_h, rules),
            "_abs": os.path.normpath(p),
        })

    def is_helper(r):
        # in a canonical tool's folder, or a module a canonical tool imports / execs by name
        d = os.path.dirname(r["_abs"])
        return d in canonical_dirs or (r["name"] in helper_names and not ROUND_RE.search(r["path"]))

    def rank(r):
        return (r["_abs"] in canonical, is_helper(r), bool(r["protect"]), r["mentioned_by"] > 0,
                not ARCHIVED_RE.search(r["path"]), not ROUND_RE.search(r["path"]), r["mtime"])

    by_sha, by_name = {}, {}
    for r in rows:
        by_sha.setdefault(r["sha"], []).append(r)
        by_name.setdefault(r["name"], []).append(r)
    keeper = {}
    for group in by_sha.values():
        best = max(group, key=rank)
        for r in group:
            if r is not best:
                keeper[r["_abs"]] = best["path"]
    fork_of = {}
    for group in by_name.values():
        heads = [r for r in group if r["_abs"] in canonical or is_helper(r)]
        if not heads or len({r["sha"] for r in group}) < 2:
            continue
        for r in group:
            if r not in heads and r["sha"] not in {h["sha"] for h in heads}:
                fork_of[r["_abs"]] = heads[0]["path"]

    # round folders side by side (run10, run11, ... / gate_r1, gate_r2): a script whose name is in a NEWER sibling round is superseded
    superseded = {}
    for group in by_name.values():
        rounds = [r for r in group if ROUND_RE.search(os.path.basename(os.path.dirname(r["path"])) + "/")]
        by_parent = {}
        for r in rounds:
            by_parent.setdefault(os.path.dirname(os.path.dirname(r["path"])), []).append(r)
        for sibs in by_parent.values():
            if len(sibs) < 2:
                continue
            newest = max(sibs, key=lambda r: r["mtime"])
            for r in sibs:
                if r is not newest:
                    superseded[r["_abs"]] = newest["path"]

    for r in rows:
        a = r["_abs"]
        rnd = ROUND_RE.search(r["path"])
        if a in canonical:
            r["status"] = "canonical"
        elif is_helper(r):
            r["status"] = "helper"
        elif a in keeper:
            r["status"] = "duplicate"
            r["keeper"] = keeper[a]
        elif ARCHIVED_RE.search(r["path"]) and r["mentioned_by"] == 0:
            r["status"] = "dead"
        elif a in fork_of:
            r["status"] = "fork"
            r["keeper"] = fork_of[a]
        elif a in superseded:
            r["status"] = "dead"
            r["keeper"] = superseded[a]
        elif rnd and r["mentioned_by"] == 0 and r["age_h"] > DEAD_HOURS:
            r["status"] = "dead"
        elif rnd:
            r["status"] = "one-off"
        elif r["mentioned_by"] > 0:
            r["status"] = "used"
        else:
            r["status"] = "unknown"
    for r in rows:
        r.pop("_abs")
    return rows


STATUS_ORDER = ["canonical", "helper", "used", "fork", "one-off", "unknown", "duplicate", "dead"]


def to_markdown(rows, title="Script inventory"):
    from collections import Counter
    c = Counter(r["status"] for r in rows)
    out = [f"# {title}", "", f"{len(rows)} scripts. " + ", ".join(f"{s} {c[s]}" for s in STATUS_ORDER if c[s]), "",
           "Status rules: `cxy/lib/inventory.py` docstring. `dead` and `duplicate` are archive candidates; "
           "`protect` says why a file never moves (archive_rules.json).", ""]
    for s in STATUS_ORDER:
        group = sorted((r for r in rows if r["status"] == s), key=lambda r: r["path"])
        if not group:
            continue
        out += [f"## {s} ({len(group)})", "", "| path | lines | age h | what | note | protect |", "|---|---|---|---|---|---|"]
        for r in group:
            if r.get("keeper"):
                note = ("same as " if r["status"] == "duplicate" else "differs from ") + f"`{r['keeper']}`"
            else:
                note = f"named in {r['mentioned_by']} files" if r["mentioned_by"] else ""
            what = r["what"].replace("|", "/")
            out.append(f"| `{r['path']}` | {r['lines']} | {r['age_h']} | {what} | {note} | {r['protect']} |")
        out.append("")
    return "\n".join(out)


def save(rows, out_md, out_json=None):
    with open(out_md, "w", encoding="utf-8") as f:
        f.write(to_markdown(rows))
    if out_json:
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=1)
