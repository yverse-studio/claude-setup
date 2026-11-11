"""cxylib: shared helpers for the cxy toolkit (plain Python 3, no bpy, no third-party packages).

One output format for every cxy command:
    OK   <what>            a check that passed
    WARN <what>            worth a look, does not fail the run
    RED  <what>            a failure; any RED makes the run exit 1
    RESULT PASS (n ok, n warn)   or   RESULT RED (n red, n warn, n ok)
"""
import hashlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CXY = os.path.dirname(HERE)                      # .../_cloud_blender/cxy
CLOUD_BLENDER = os.path.dirname(CXY)             # .../_cloud_blender
PF_ROOT = os.environ.get("CXY_ROOT") or os.path.dirname(CLOUD_BLENDER)   # /mnt/project-files (CXY_ROOT overrides)

BLENDER_DEFAULT = "/opt/blender/blender-5.2.3-linux-x64/blender"
BPY_PY_DEFAULT = "/tmp/bpyenv/bin/python"
PINNED_BLENDER = (5, 2)


class Report:
    """Collects OK/WARN/RED lines and prints them in the one cxy format."""

    def __init__(self, out=None):
        self.out = out or sys.stdout
        self.counts = {"OK": 0, "WARN": 0, "RED": 0}

    def _line(self, level, msg):
        self.counts[level] += 1
        print(f"{level:<4} {msg}", file=self.out)

    def ok(self, msg):
        self._line("OK", msg)

    def warn(self, msg):
        self._line("WARN", msg)

    def red(self, msg):
        self._line("RED", msg)

    @property
    def failed(self):
        return self.counts["RED"] > 0

    def finish(self):
        """Print the RESULT line and return the exit code (0 pass, 1 red)."""
        c = self.counts
        if self.failed:
            print(f"RESULT RED ({c['RED']} red, {c['WARN']} warn, {c['OK']} ok)", file=self.out)
            return 1
        print(f"RESULT PASS ({c['OK']} ok, {c['WARN']} warn)", file=self.out)
        return 0


def sha256(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def blender_exe():
    """Blender binary: the pinned 5.2.3 cloud path if it exists, else the laptop's tools/BLENDER_EXE.txt (needs STUDIO_ROOT)."""
    if os.path.isfile(BLENDER_DEFAULT):
        return BLENDER_DEFAULT
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    import paths
    return paths.blender_exe()


def bpy_python():
    """Python that has the bpy==5.2.3 wheel: env CXY_BPY (or CC_PY), else /tmp/bpyenv/bin/python."""
    return os.environ.get("CXY_BPY") or os.environ.get("CC_PY") or BPY_PY_DEFAULT


def version_ok(version_tuple):
    """True when a Blender version tuple is on the pinned 5.2.x line."""
    return tuple(version_tuple[:2]) == PINNED_BLENDER


def pf(*parts):
    """Path inside project-files."""
    return os.path.join(PF_ROOT, *parts)
