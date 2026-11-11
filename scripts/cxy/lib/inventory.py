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


BINARY_EXT = (".blend", ".blend1", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".exr", ".hdr", ".tif", ".tiff", ".bmp",
              ".zip", ".7z", ".gz", ".tar", ".rar", ".npz", ".npy", ".pkl", ".fbx", ".glb", ".gltf", ".obj", ".vrm", ".bvh",
              ".mp4", ".webm", ".mov", ".mkv", ".wav", ".mp3", ".ogg", ".flac", ".ttf", ".otf", ".woff", ".woff2", ".pdf",
              ".psd", ".kra", ".abc", ".vdb", ".pyc", ".so", ".dll", ".exe", ".bin", ".sha256")
NEVER_MOVE = ("__init__.py", "__main__.py", "conftest.py", "setup.py")
LOADED_BY_FOLDER_RE = re.compile(r"(^|/)(addons|startup|modules|presets|scripts/startup)/")   # Blender loads these by place


def walk_text(root, limit=None):
    """Every file that reads as text (any extension or none: Makefile, .ts, .vue, .gd, .yml ...), for mentions."""
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        for f in sorted(files):
            if f.lower().endswith(BINARY_EXT) or ".zip.part" in f or f.startswith("INVENTORY"):
                continue
            p = os.path.join(d, f)
            try:
                if os.path.getsize(p) > (limit or TEXT_LIMIT):
                    continue
                with open(p, "rb") as fh:
                    head = fh.read(4096)
                    if b"\0" in head and head[:2] not in (b"\xff\xfe", b"\xfe\xff"):   # binary, unless UTF-16 text
                        continue
            except OSError:
                continue
            yield p


def walk(root, exts):
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        for f in sorted(files):
            if f.endswith(exts):
                yield os.path.join(d, f)


TEXT_LIMIT = 64_000_000   # big notebooks and logs are read too (a missed caller is worse than a slow scan)


def _decode(raw):
    """UTF-16 with a byte-order mark (PowerShell 5 `>` / Out-File on the laptop), else UTF-8."""
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16", errors="replace")
    return raw.decode("utf-8", errors="replace")


def _read(path, limit=TEXT_LIMIT):
    try:
        if os.path.getsize(path) > limit:
            return ""
        with open(path, "rb") as fh:
            return _decode(fh.read())
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


def protection(rel, age_h, rules, size=None):
    """Why a file must not be moved ('' = it may move)."""
    base = os.path.basename(rel)
    if base in NEVER_MOVE:
        return "package / test marker file"
    if re.match(r"test_.*\.py$|.*_test\.py$|.*\.test\.m?js$", base) or re.search(r"(^|/)tests?/", rel):
        return "test file (found by name, not by mention)"
    if size == 0:
        return "empty file (marker)"
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
    texts = {p: _read(p) for p in walk_text(root)}

    helper_names = set()
    for p in canonical:
        t = texts.get(p, "")
        helper_names |= {m + ".py" for m in IMPORT_RE.findall(t)}
        helper_names |= {os.path.basename(m) for m in EXEC_RE.findall(t)}

    base_names = {os.path.basename(p) for p in scripts}
    mentions = {b: set() for b in base_names}
    # lookbehind: a match only starts at the start of a name, so a long run of word chars is scanned once, not per offset
    word = re.compile(r"(?<![\w.\-])[\w.\-]+\.(?:py|mjs|js|sh|ps1)")
    for p, t in texts.items():
        for b in set(word.findall(t)) & base_names:
            mentions[b].add(p)

    # a module any other script imports (also `from pkg.mod import`, relative, or via sys.path from another folder)
    importers = {}
    for p in set(scripts) | set(texts):
        t = texts.get(p) or _read(p)
        for n in imported_names(t):   # every text file: CI yml, bat, toml, Makefile can run `python -m x`
            importers.setdefault(n + ".py", set()).add(p)
        for f in js_imported_files(t):
            importers.setdefault(f, set()).add(p)

    # whole-word index over every text file (conservative: any word equal to a script's stem counts as a caller)
    words = {}
    for p, t in texts.items():
        for wd in set(re.findall(r"\w[\w\-]*", t)):
            words.setdefault(wd, set()).add(p)
    sha_of = {p: sha256(p)[:16] for p in scripts}

    rows = []
    for p in scripts:
        rel = os.path.relpath(p, root)
        st = os.stat(p)
        text = texts.get(p) or _read(p)
        b = os.path.basename(p)
        # mentioned = its file name, an import of it, or its bare stem as a whole word (`python -c "import x"`,
        # `--python-expr`, `import_module("x")`, `require('./lib')` -> lib/index.js) in any other text file outside its
        # folder; a byte-identical copy of it does not count (copies name themselves)
        own_sha = sha_of.get(p)
        stems = {os.path.splitext(b)[0]}
        if stems == {"index"}:
            stems.add(os.path.basename(os.path.dirname(p)))
        cands = set(mentions.get(b, ())) | set(importers.get(b, ()))
        for st_ in stems:
            cands |= words.get(st_, set())
        # a file with the same name (a fork naming itself in its docstring) counts only when it points at a path:
        # "../run11/run.py"
        # ... or imports it by a dotted path: `from run13.bake import main`, `-m pkg.bake`
        path_ref = re.compile(r"[/\\]" + re.escape(b) + r"\b|\w\." + re.escape(os.path.splitext(b)[0]) + r"\b")
        others = {m for m in cands if m != p and os.path.dirname(m) != os.path.dirname(p) and sha_of.get(m, "") != own_sha
                  and (os.path.basename(m) != b or path_ref.search(texts.get(m, "")))}
        age_h = round((now - st.st_mtime) / 3600, 1)
        rows.append({
            "path": rel, "name": b, "bytes": st.st_size, "lines": text.count("\n") + 1,
            "mtime": int(st.st_mtime), "age_h": age_h,
            "sha": sha_of[p], "what": summary_line(text),
            "mentioned_by": len(others),
            "protect": protection(rel, age_h, rules, st.st_size) or (
                "Blender add-on / startup script (loaded by place)"
                if LOADED_BY_FOLDER_RE.search(rel) or "bl_info" in text or re.search(r"^def register\(", text, re.M) else ""),
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
