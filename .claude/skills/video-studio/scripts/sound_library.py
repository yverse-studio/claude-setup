"""The free sound library: import licence-clean sounds, measure them, and check the manifest.

Usage:
  python sound_library.py add <library> <curation.json>   import, convert, measure, tag
  python sound_library.py check <library>                  exit 0 only when every entry is clean

<library> holds manifest.json, sfx/<category>/, music/<mood>/ and licences/<source>/.
<curation.json> is a list of picks: {"src", "id", "kind": "sfx"|"music", "category" or "mood",
"source", "licence", "proof", "url", "tags": [...], "presets": [...], "note"}.

add needs ffmpeg (and librosa for music BPM); check is stdlib only, so CI runs it.
Rules: ../sound-kit.md (Library).
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

LICENCES = {"CC0-1.0", "public-domain", "own-synthesis"}
PRESETS = {"real_talk", "explainer", "big"}
SFX_CATEGORIES = {"hit", "pop", "whoosh", "riser", "tick", "thud", "scratch", "bell", "glitch"}
MUSIC_MOODS = {"chill", "funky", "playful", "drive", "cinematic", "retro", "tense"}
SFX_PEAK_DBFS = -3.0
SAMPLE_RATE = 48000
ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LOUDNESS = re.compile(r"I:\s+(-?[\d.]+) LUFS.*?Peak:\s+(-?[\d.]+|-inf) dBFS", re.S)
RMS = re.compile(r"Overall.*?RMS level dB:\s+(-?[\d.]+|-inf)", re.S)
GATED = -70.0  # ebur128 gates out sounds shorter than 0.4 s: those get only rms


def load(library):
    path = Path(library) / "manifest.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"entries": []}


def problems(library):
    """Every reason the library is not clean; empty means clean."""
    library = Path(library)
    entries = load(library)["entries"]
    found, seen = [], set()
    for entry in entries:
        name = entry.get("id", "?")
        if not ID.match(name):
            found.append(f"{name}: id must be kebab-case")
        if name in seen:
            found.append(f"{name}: duplicate id")
        seen.add(name)
        kind = entry.get("kind")
        group = entry.get("category") if kind == "sfx" else entry.get("mood")
        allowed = SFX_CATEGORIES if kind == "sfx" else MUSIC_MOODS if kind == "music" else set()
        if group not in allowed:
            found.append(f"{name}: unknown {kind} group {group!r}")
        if entry.get("licence") not in LICENCES:
            found.append(f"{name}: licence {entry.get('licence')!r} is not CC0, public domain or own")
        if entry.get("licence") != "own-synthesis" and not entry.get("url"):
            found.append(f"{name}: no source url")
        proof = entry.get("proof")
        if not proof or not (library / proof).is_file():
            found.append(f"{name}: licence proof {proof!r} missing")
        if not entry.get("file") or not (library / entry["file"]).is_file():
            found.append(f"{name}: file {entry.get('file')!r} missing")
        if not set(entry.get("presets") or []) <= PRESETS or not entry.get("presets"):
            found.append(f"{name}: presets must be a non-empty subset of {sorted(PRESETS)}")
        if not entry.get("tags"):
            found.append(f"{name}: no tags")
        if kind == "music" and not entry.get("bpm"):
            found.append(f"{name}: music without bpm")
        if entry.get("lufs") is None and entry.get("rms") is None:
            found.append(f"{name}: not loudness-measured")
    return found


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True)


def measure(path):
    """Integrated loudness (LUFS, None when too short to gate), RMS and sample peak (dBFS), seconds."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=sample,astats", "-f", "null", "-"],
        capture_output=True, text=True, check=True).stderr
    match = LOUDNESS.search(out[out.rfind("Summary:"):])
    lufs, peak = (float(match.group(1)), float(match.group(2))) if match else (None, None)
    rms = RMS.search(out)
    dur = float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)).stdout)
    return {"lufs": lufs if lufs is not None and lufs > GATED else None,
            "rms": float(rms.group(1)) if rms and rms.group(1) != "-inf" else None,
            "peak": peak, "seconds": round(dur, 3)}


def tempo(path):
    import librosa  # only music needs it; check stays stdlib
    y, sr = librosa.load(str(path), sr=22050, mono=True, duration=90)
    bpm, _ = librosa.beat.beat_track(y=y, sr=sr)
    return round(float(bpm[0] if hasattr(bpm, "__len__") else bpm), 1)


def add_one(library, pick):
    kind = pick["kind"]
    group = pick["category"] if kind == "sfx" else pick["mood"]
    src = Path(pick["src"])
    if kind == "sfx":
        dest = library / "sfx" / group / f"{pick['id']}.wav"
        dest.parent.mkdir(parents=True, exist_ok=True)
        peak = measure(src)["peak"]
        gain = SFX_PEAK_DBFS - peak if peak is not None else 0.0
        run("ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", f"volume={gain:.2f}dB",
            "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", str(dest))
    else:
        dest = library / "music" / group / f"{pick['id']}{src.suffix.lower()}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dest)
    entry = {key: pick[key] for key in pick if key != "src"}
    entry["file"] = dest.relative_to(library).as_posix()
    entry.update(measure(dest))
    if kind == "music":
        entry.setdefault("bpm", tempo(dest))
    return entry


def add(library, curation):
    library = Path(library)
    picks = json.loads(Path(curation).read_text(encoding="utf-8"))
    by_id = {e["id"]: e for e in load(library)["entries"]}
    for pick in picks:
        by_id[pick["id"]] = add_one(library, pick)
        print(f"added {pick['id']}")
    entries = sorted(by_id.values(), key=lambda e: (e["kind"], e.get("category") or e.get("mood"), e["id"]))
    manifest = {"schema": 1, "rules": "claude-setup .claude/skills/video-studio/sound-kit.md", "entries": entries}
    (library / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv):
    if len(argv) == 3 and argv[1] == "check":
        found = problems(argv[2])
        for line in found:
            print(line)
        print(f"{len(load(argv[2])['entries'])} entries, {len(found)} problems")
        return 1 if found else 0
    if len(argv) == 4 and argv[1] == "add":
        add(argv[2], argv[3])
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
