"""Sound and cuts for a video, free and local. python3 sound.py <cmd>:
  beats <audio> [-o f.json]   bpm, beats, downbeats, strong cues (librosa)
  snap <beats.json> <cuts.json> --preset P   move cuts onto beats, whole frames
  sfx <outdir>                synthesise our own SFX library (numpy)
  detect <video>              cut times from scene detection (ffmpeg)
  cut <video> <snapped.json>  re-cut the video to the snapped list, same length
  mix <video> <cues.json> --preset P [--music bed]   SFX + ducked bed, two-pass loudnorm (ffmpeg)
  loud <file>                 integrated LUFS, true peak, LRA
  presets                     the preset table as markdown
Strong-cue weights are ported from the brag analyzer (MIT), analyze_music_cues.py.
"""
import argparse
import json
import random
import re
import subprocess
import sys
import tempfile
import wave
import zlib
from pathlib import Path

PRESETS = {
    "real_talk": dict(sfx_cap=2, music=True, tolerance=0.08, min_shot=0.8, bed_db=-20, duck_db=12),
    "explainer": dict(sfx_cap=4, music=True, tolerance=0.08, min_shot=1.5, bed_db=-22, duck_db=14),
    "big": dict(sfx_cap=8, music=True, tolerance=0.10, min_shot=0.4, bed_db=-16, duck_db=10),
}
LOUDNESS = dict(lufs=-14, tp=-1.5, lra=11)
AAC_MARGIN_DB = 0.5  # AAC encoding overshoots the limiter a little
STRONG_TOLERANCE, STRONG_THRESHOLD, STRONG_MIN_GAP = 0.15, 0.45, 1.0
SR, TAKES, EPS = 48000, 3, 1e-9
DEFAULT_SFX_DIR = Path(__file__).resolve().parent.parent / "sound"  # the shared library (#265)
MUSIC_ACTIVE, MUSIC_BEAT = 0.6, 0.12  # measured: brag 0.99/0.33, speech-like 0.5/0.07, noise 1.0/0.08


def presets_table():
    keys = list(next(iter(PRESETS.values())))
    rows = ["| preset | " + " | ".join(keys) + " |", "|" + "---|" * (len(keys) + 1)]
    rows += [f"| {n} | " + " | ".join(str(p[k]) for k in keys) + " |" for n, p in PRESETS.items()]
    return "\n".join(rows + ["", "all: " + ", ".join(f"{k} {v}" for k, v in LOUDNESS.items())])


def normalise_cuts(raw):
    out = []
    for item in raw:
        cut = (item["t"], item.get("kind", "cut")) if isinstance(item, dict) and isinstance(item.get("t"), (int, float)) else (item, "cut")
        if not isinstance(cut[0], (int, float)) or cut[1] not in ("cut", "hook", "payoff"):
            raise ValueError(f"bad cut: {item!r} (a second, or {{\"t\": 1.2, \"kind\": \"cut|hook|payoff\"}})")
        out.append((float(cut[0]), cut[1]))
    return out


def candidates(t, kind, beats, tol):
    """(time, why) near t, nearest first: strong cues for hook/payoff, then beats or downbeats."""
    hook = kind in ("hook", "payoff")
    found = [(c["t"], "strong cue") for c in beats.get("strong_cues", []) if hook and abs(c["t"] - t) <= STRONG_TOLERANCE + EPS]
    found.sort(key=lambda c: abs(c[0] - t))
    near = lambda grid: sorted((b for b in grid if abs(b - t) <= tol + EPS), key=lambda b: abs(b - t))
    downs = [(b, "downbeat") for b in near(beats.get("downbeats", []))] if hook else []
    return found + downs + [(b, "beat") for b in near(beats.get("beats", []))]  # hook/payoff: strong cue, then downbeat, then any beat


def to_frame(t, fps):
    return round(t * fps) / fps


def snap_cuts(beats, raw_cuts, preset, fps=30):
    cuts = normalise_cuts(raw_cuts)
    tol, min_shot = preset["tolerance"], preset["min_shot"]
    frames = [to_frame(t, fps) for t, _ in cuts]
    out, prev_to = [], None
    for i, (t, kind) in enumerate(cuts):
        # room for this cut: keep min_shot to the previous snapped cut and the next original (never shrink a gap further)
        lo = -1e9 if i == 0 else prev_to + min(min_shot, frames[i] - frames[i - 1])
        hi = 1e9 if i + 1 == len(cuts) else frames[i + 1] - min(min_shot, frames[i + 1] - frames[i])
        to, moved, reason = frames[i], False, f"no beat within {tol}"
        for cand, why in candidates(t, kind, beats, tol):
            c = to_frame(cand, fps)
            if not lo - EPS <= c <= hi + EPS:
                reason = "min_shot"
                continue
            to, moved, reason = c, abs(c - frames[i]) > EPS, f"{why} {cand:.3f} ({c - t:+.3f})"
            break
        out.append(dict(kind=kind, **{"from": t, "to": round(to, 4)}, frame=round(to * fps), moved=moved, reason=reason))
        prev_to = to
    return out


def validate_cues(cues, preset, kinds):
    if not isinstance(cues, list):
        return ["cues.json must be a list"]
    errors = []
    for i, c in enumerate(cues):
        c = c if isinstance(c, dict) else {}
        num = lambda k, lo, hi, d=None: isinstance(c.get(k, d), (int, float)) and lo <= c.get(k, d) <= hi
        errors += [f"cue {i}: {m}" for ok, m in (
            (num("t", 0, 1e6), "t must be a number of seconds >= 0"),
            (c.get("sfx") in kinds, f"unknown sfx {c.get('sfx')!r} (have: {', '.join(sorted(kinds))})"),
            (num("gain_db", -40, 6, 0), "gain_db must be between -40 and 6")) if not ok]
    if len(cues) > (cap := preset["sfx_cap"]):
        errors.append(f"{len(cues)} SFX, cap is {cap}; remove: " + ", ".join(f"cue {i} ({c.get('sfx')} at {c.get('t')})" for i, c in enumerate(cues) if i >= cap))
    return errors


def pick_takes(cues, takes, seed=7):
    """One file per cue in time order, never the file just used."""
    rng, last, picked = random.Random(seed), None, []
    for c in sorted(cues, key=lambda c: c["t"]):
        options = [f for f in takes[c["sfx"]] if f != last]
        if not options:
            raise ValueError(f"only one take of {c['sfx']}: it would play twice in a row at {c['t']}")
        last = rng.choice(options)
        picked.append((c, last))
    return picked


def parse_loudnorm(stderr):
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr)
    if not m:
        raise ValueError("no loudnorm JSON in ffmpeg output")
    return {k: float(v) for k, v in json.loads(m.group(0)).items() if k != "normalization_type"}


def loudnorm_filter(measured=None):
    f = f"loudnorm=I={LOUDNESS['lufs']}:TP={LOUDNESS['tp'] - AAC_MARGIN_DB}:LRA={LOUDNESS['lra']}"
    if measured is None:
        return f + ":print_format=json"
    keys = ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")
    names = ("measured_I", "measured_TP", "measured_LRA", "measured_thresh", "offset")
    return f + "".join(f":{n}={measured[k]}" for n, k in zip(names, keys)) + ":linear=true:print_format=json"


DUCK_RATIO = 8
DUCK_BIAS_DB = 4.1  # measured: the detector reads voice about this much hotter than its LUFS


def duck_threshold(voice_db, duck_db, ratio=DUCK_RATIO):
    """Linear sidechain threshold so voice at voice_db (dB) pulls the bed down by duck_db: (L - T) * (1 - 1/ratio) = duck."""
    if duck_db is None or voice_db is None:
        return 0.05
    return min(1.0, max(0.001, 10 ** ((voice_db - (duck_db - DUCK_BIAS_DB) / (1 - 1 / ratio)) / 20)))


def build_graph(picked, has_voice, music, preset, duration, threshold=0.05):
    """Filter graph text; inputs: 0 video, 1 voice source if silent, then one per SFX, then the bed."""
    fmt = f"aformat=sample_rates={SR}:channel_layouts=stereo"
    voice_in = 0 if has_voice else 1
    first_sfx = 1 if has_voice else 2
    parts = [f"[{voice_in}:a]{fmt}[voice]"]
    names = []
    for i, (c, _) in enumerate(picked):
        ms = round(c["t"] * 1000)
        parts.append(f"[{first_sfx + i}:a]{fmt},volume={c.get('gain_db', -6)}dB,adelay={ms}|{ms}[s{i}]")
        names.append(f"[s{i}]")
    if names:
        parts.append("".join(names) + f"amix=inputs={len(names)}:normalize=0[sfx]")
    layers = ["[voice]"]
    if music:
        bed = first_sfx + len(names)
        parts += [f"[{bed}:a]{fmt},volume={preset['bed_db'] if has_voice else 0}dB,afade=t=out:st={max(0, duration - 1.0):.2f}:d=1[bed]",
                  "[voice]asplit=2[v1][v2]",
                  f"[bed][v1]sidechaincompress=threshold={threshold:.5f}:ratio={DUCK_RATIO}:attack=20:release=400[duck]"]
        layers = ["[v2]", "[duck]"]
    layers += ["[sfx]"] * bool(names)
    parts.append("".join(layers) + f"amix=inputs={len(layers)}:normalize=0:duration=first[mix]")
    return ";".join(parts)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed: {' '.join(cmd[:4])} ...\n{r.stderr[-1500:]}")
    return r.stderr


def probe(video):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", str(video)]
    info = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
    return float(info["format"]["duration"]), any(s["codec_type"] == "audio" for s in info["streams"])


def measure(path):
    return parse_loudnorm(run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", loudnorm_filter(), "-f", "null", "-"]))


def render(video, inputs, graph, out, duration):
    base = ["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(video), *inputs]
    pass1 = run(base + ["-filter_complex", f"{graph};[mix]{loudnorm_filter()}[out]", "-map", "[out]", "-f", "null", "-"])
    final = f"{graph};[mix]{loudnorm_filter(parse_loudnorm(pass1))},aresample={SR}[out]"
    run(base + ["-filter_complex", final, "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-ar", str(SR), "-t", f"{duration:.3f}", "-movflags", "+faststart", str(out)])


def merge_scene_times(times, duration, gap=0.25, edge=0.3):
    """One cut per cluster of detections (its first frame); nothing within `edge` s of the ends."""
    out = []
    for t in sorted(times):
        if edge <= t <= duration - edge and (not out or t - out[-1] >= gap):
            out.append(t)
    return out


def detect_cuts(video, threshold=0.2):
    err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-an", "-vf", f"select='gt(scene,{threshold})',showinfo", "-f", "null", "-"])
    return merge_scene_times([float(t) for t in re.findall(r"pts_time:([\d.]+)", err)], probe(video)[0])


def retime_plan(src, dst):
    """Per shot (start frame, frames kept, frames held): trim the tail of a shorter shot, hold the last frame of a longer one."""
    return [(s0, min(s1 - s0, d1 - d0), (d1 - d0) - min(s1 - s0, d1 - d0)) for (s0, s1), (d0, d1) in zip(zip(src, src[1:]), zip(dst, dst[1:]))]


def cmd_cut(a):
    snapped = json.loads(Path(a.snapped).read_text())
    total = round(probe(a.video)[0] * a.fps)
    plan = retime_plan([0] + [round(c["from"] * a.fps) for c in snapped] + [total], [0] + [c["frame"] for c in snapped] + [total])
    parts = [f"[0:v]trim=start_frame={s}:end_frame={s + keep},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={hold / a.fps:.5f}[v{i}]" for i, (s, keep, hold) in enumerate(plan)]
    graph = ";".join(parts) + ";" + "".join(f"[v{i}]" for i in range(len(plan))) + f"concat=n={len(plan)}:v=1:a=0[v]"
    run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(a.video), "-filter_complex", graph, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-r", str(a.fps), "-c:a", "copy", str(a.o)])
    print(f"{a.o}: {len(plan)} shots re-timed, {total} frames")


def music_features(path):
    """(active share, beat regularity) of the source audio, or None without numpy/audio: music is steady and periodic."""
    try:
        import numpy as np
    except ImportError:
        return None
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, "<f4")
    n = len(x) // 80  # 10 ms frames
    if n < 300:  # under 3 s
        return None
    db = 20 * np.log10(np.sqrt((x[:n * 80].reshape(n, 80) ** 2).mean(1)) + 1e-9)
    onset = np.maximum(np.diff(db), 0)
    onset -= onset.mean()
    ac = np.correlate(onset, onset, "full")[len(onset) - 1:]
    return float((db > db.max() - 40).mean()), float(ac[30:101].max() / ac[0]) if ac[0] > 0 else 0.0


def looks_like_music(feats):
    return feats is not None and feats[0] >= MUSIC_ACTIVE and feats[1] >= MUSIC_BEAT  # beat peak at 0.3-1.0 s lags


def find_takes(sfx_dir):
    """Kind -> files, recursive: a file in a subfolder takes the folder's name (sfx/hit/x.wav is 'hit'), else its stem minus _N. music/ is skipped."""
    root, takes = Path(sfx_dir), {}
    for f in sorted(root.rglob("*")):
        rel = f.relative_to(root)
        if f.suffix.lower() in (".wav", ".ogg", ".flac", ".mp3") and "music" not in rel.parts[:-1]:
            takes.setdefault(f.parent.name if f.parent != root else re.sub(r"_\d+$", "", f.stem), []).append(f)
    return takes


def library_manifest(sfx_dir):
    """The shared library's manifest (a dict with entries); our own sfx output writes a plain list, which is not one."""
    f = Path(sfx_dir) / "manifest.json"
    data = json.loads(f.read_text()) if f.is_file() else None
    return data if isinstance(data, dict) else None


def library_kinds(manifest, preset_name):
    return {e["category"] for e in manifest["entries"] if e["kind"] == "sfx" and preset_name in e["presets"]}


def pick_from_library(cues, library, preset_name, salt=""):
    """Library mode: eligible files = the library's sfx of that category for the preset (what sound_library.pick filters on).
    Rotates through them by (cue index + crc32(salt)) % n, so takes vary but the same input gives the same output; never the file used last."""
    try:
        import sound_library
    except ImportError:
        sys.exit("error: library module missing: merge #265 (scripts/sound_library.py) or use a folder of numbered files")
    entries = sound_library.load(Path(library))["entries"]
    last, picked, offset = None, [], zlib.crc32(salt.encode())
    for i, c in enumerate(sorted(cues, key=lambda c: c["t"])):
        ok = [e["file"] for e in entries if e["kind"] == "sfx" and e["category"] == c["sfx"] and preset_name in e["presets"]]
        if not ok:
            raise ValueError(f"no {c['sfx']!r} sound for preset {preset_name!r}")
        n = (i + offset) % len(ok)
        if ok[n] == last:
            n = (n + 1) % len(ok)
        if ok[n] == last:
            raise ValueError(f"only one {c['sfx']!r} sound for {preset_name}: it would play twice in a row at {c['t']}")
        last = ok[n]
        picked.append((c, Path(library) / last))
    return picked


def fmt(path, m):
    return f"{path}: {m['input_i']:.1f} LUFS, true peak {m['input_tp']:.1f} dBTP, LRA {m['input_lra']:.1f}"


def cmd_mix(a):
    preset = PRESETS[a.preset]
    if a.music and not preset["music"]:
        sys.exit(f"preset {a.preset} has no music bed")
    sfx_dir = a.sfx_dir or DEFAULT_SFX_DIR
    if not Path(sfx_dir).is_dir():
        if a.sfx_dir:
            sys.exit(f"error: no such --sfx-dir {sfx_dir}")
        sfx_dir = tempfile.mkdtemp(prefix="sfx-")
        print(f"note: {DEFAULT_SFX_DIR} not found; synthesised the own-synthesis SFX library into {sfx_dir} ({make_sfx(sfx_dir, a.seed)} files)")
    manifest = library_manifest(sfx_dir)
    takes = {k: [] for k in library_kinds(manifest, a.preset)} if manifest else find_takes(sfx_dir)
    cues = json.loads(Path(a.cues).read_text())
    if errors := validate_cues(cues, preset, takes):
        sys.exit("\n".join(errors))
    duration, has_voice = probe(a.video)
    if has_voice and looks_like_music(music_features(a.video)):
        note = "source already carries music (the bed would clash): use the raw clip without music (and without SFX baked in)"
        if a.music and not a.force_music:
            sys.exit(f"error: {note}, or pass --force-music")
        print(f"warning: source already has a bed; final-nomusic is not music-free. {note}", file=sys.stderr)
    picked = pick_from_library(cues, sfx_dir, a.preset, Path(a.video).name) if manifest else pick_takes(cues, takes, a.seed)
    for c, f in picked:
        print(f"cue {c['t']:.3f} {c['sfx']} -> {f.relative_to(sfx_dir) if manifest else f.name} ({'library' if manifest else 'folder'} take, preset {a.preset})")
    out = Path(a.o)
    out.mkdir(parents=True, exist_ok=True)
    silent = [] if has_voice else ["-f", "lavfi", "-t", f"{duration:.3f}", "-i", f"anullsrc=r={SR}:cl=stereo"]
    sfx_inputs = [x for _, f in picked for x in ("-i", str(f))]
    threshold = duck_threshold(measure(a.video)["input_i"] if has_voice and a.music else None, preset["duck_db"])
    jobs = [("final-nomusic.mp4", [], False)] + ([("final.mp4", ["-stream_loop", "-1", "-i", str(a.music)], True)] if a.music else [])
    for name, bed, music in jobs:
        graph = build_graph(picked, has_voice, music, preset, duration, threshold)
        render(a.video, silent + sfx_inputs + bed, graph, out / name, duration)
        m = measure(out / name)
        print(fmt(out / name, m) + ("" if abs(m["input_i"] - LOUDNESS["lufs"]) <= 1 else "  (off target: too little sustained audio to normalise)"))


def emit(a, data):
    text = json.dumps(data, indent=1)
    Path(a.o).write_text(text) if a.o else print(text)


def cmd_snap(a):
    beats = json.loads(Path(a.beats).read_text())
    result = snap_cuts(beats, json.loads(Path(a.cuts).read_text()), PRESETS[a.preset], a.fps)
    emit(a, result)
    print(f"{sum(r['moved'] for r in result)} of {len(result)} cuts moved", file=sys.stderr)


def strong_cues(onset, contrast, rms, bass, times, frames):
    """Brag's intensity: 0.45 onset + 0.25 contrast + 0.20 rms + 0.10 bass; threshold, then min gap."""
    scored = [(0.45 * onset[f] + 0.25 * contrast[f] + 0.20 * rms[f] + 0.10 * bass[f], times[f]) for f in frames]
    kept = []
    for score, t in sorted(scored, reverse=True):
        if score >= STRONG_THRESHOLD and all(abs(t - k["t"]) >= STRONG_MIN_GAP for k in kept):
            kept.append(dict(t=round(float(t), 3), score=round(float(score), 3)))
    return sorted(kept, key=lambda k: k["t"])


def analyse(path):
    try:
        import librosa
        import numpy as np
    except ImportError:
        print("librosa missing: python3 -m venv /tmp/snd && /tmp/snd/bin/pip -q install librosa", file=sys.stderr)
        sys.exit(2)
    hop, (y, sr) = 512, librosa.load(path, sr=22050, mono=True)

    def norm(v):
        v = np.maximum(np.nan_to_num(np.asarray(v, dtype=float)), 0)
        hi = np.percentile(v, 98) or v.max()
        return np.clip(v / hi, 0, 1) if hi > 1e-12 else np.zeros_like(v)

    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    onset = norm(env)
    r = max(1, round(0.5 * sr / hop))
    contrast = norm([max(0.0, onset[i] - np.median(onset[max(0, i - r):i + r + 1])) for i in range(len(onset))])
    rms = norm(librosa.feature.rms(y=y, hop_length=hop)[0])
    spec = np.abs(librosa.stft(y, n_fft=4096, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
    bass = norm(spec[(freqs >= 30) & (freqs < 150)].mean(axis=0))
    n = min(len(onset), len(contrast), len(rms), len(bass))
    tempo, bf = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, trim=False)
    beats = librosa.frames_to_time(bf, sr=sr, hop_length=hop)
    peaks = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop)
    frames = sorted(set(int(f) for f in list(bf) + list(peaks) if f < n))
    times = librosa.frames_to_time(np.arange(n), sr=sr, hop_length=hop)
    phase = max(range(4), key=lambda p: sum(onset[min(int(f), n - 1)] for f in bf[p::4])) if len(bf) else 0
    return dict(bpm=round(float(np.asarray(tempo).reshape(-1)[0]), 2), duration=round(len(y) / sr, 3),
                beats=[round(float(b), 3) for b in beats], downbeats=[round(float(b), 3) for b in beats[phase::4]],
                strong_cues=strong_cues(onset, contrast, rms, bass, times, frames))


def cmd_beats(a):
    data = analyse(a.audio)
    emit(a, data)
    print(f"{data['bpm']} bpm, {len(data['beats'])} beats, {len(data['strong_cues'])} strong cues", file=sys.stderr)


SECONDS = dict(hit=0.4, whoosh_up=0.5, whoosh_down=0.5, riser=1.5, tick=0.05, thud=0.3, boom=1.4)  # no pop/scratch: cartoony


def sine(np, freq, t):
    return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(freq, t.shape)) / SR)


def sweep(np, rng, t, f_start, f_end, width=0.5):
    """Noise through a moving band: windowed FFT blocks (overlap-add), centre glides f_start to f_end."""
    n, block, hop = len(t), 2048, 512
    noise = rng.standard_normal(n + block)
    out, win, fr = np.zeros(n + block), np.hanning(block), np.fft.rfftfreq(block, 1 / SR)
    for s in range(0, n, hop):
        centre = f_start + (f_end - f_start) * min(1.0, s / max(1, n))
        gain = np.exp(-0.5 * (np.log2(np.maximum(fr, 1) / centre) / width) ** 2)
        out[s:s + block] += np.fft.irfft(np.fft.rfft(noise[s:s + block] * win) * gain, block) * win
    return out[:n] / max(1e-9, np.abs(out[:n]).max())


def synth_one(kind, p, rng, np):
    """One take of an effect; p is the pitch multiplier (1 +- 6%)."""
    t = np.arange(int(SR * SECONDS[kind])) / SR
    sn = lambda f: sine(np, f, t)
    sw = lambda a, b, w=0.5: sweep(np, rng, t, p * a, p * b, w)
    e = lambda tau: np.exp(-t / tau)
    if kind == "tick":
        return (sn(p * 2600) * 0.7 + sw(5000, 5000, 0.4) * 0.3) * e(0.006)
    if kind == "hit":
        return sn(p * (50 + 100 * e(0.04))) * e(0.07) + 0.5 * sw(900, 300, 1.2) * e(0.04)
    if kind == "thud":
        return sn(p * (45 + 50 * e(0.05))) * e(0.05) + 0.15 * sw(200, 100) * e(0.02)
    if kind == "boom":
        return np.tanh(2.5 * sn(p * (32 + 60 * e(0.1)))) * e(0.3) + 0.3 * sw(300, 80, 1.0) * e(0.05)
    if kind.startswith("whoosh"):
        up = kind == "whoosh_up"
        return (sw(250, 4500, 0.6) if up else sw(4500, 250, 0.6)) * np.sin(np.pi * np.minimum(1, (t / 0.5) ** (0.6 if up else 1.6))) ** 2
    r = t / 1.5  # riser: swells, then drops away over the last 250 ms instead of stopping at full level
    return r ** 2 * np.minimum(1, (1.5 - t) / 0.25) ** 2 * (0.7 * sw(300, 5000, 0.8) + 0.4 * sn(p * (200 + 1800 * r ** 2)))


def finish(x, np):
    x = x - x.mean()
    ramp = np.linspace(0, 1, int(SR * 0.008))  # 8 ms fades
    x[:len(ramp)] *= ramp
    x[-len(ramp):] *= ramp[::-1]
    return x / np.abs(x).max() * 10 ** (-3 / 20)


def write_wav(path, x, np):
    with wave.open(str(path), "wb") as w:
        w.setparams((1, 2, SR, 0, "NONE", "NONE"))
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def make_sfx(outdir, seed=7):
    try:
        import numpy as np
    except ImportError:
        sys.exit("numpy missing: python3 -m pip install numpy")
    out, rng, manifest = Path(outdir), np.random.default_rng(seed), []
    out.mkdir(parents=True, exist_ok=True)
    for kind in SECONDS:
        for take in range(1, TAKES + 1):
            x = finish(synth_one(kind, 1 + rng.uniform(-0.06, 0.06), rng, np), np)
            name = f"{kind}_{take}.wav"
            write_wav(out / name, x, np)
            manifest.append(dict(file=name, kind=kind, length_ms=round(len(x) * 1000 / SR), source="own synthesis", licence="none (own)"))
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    (out / "LICENCE.txt").write_text("own synthesis by sound.py, no licence needed\n")
    return len(manifest)


def cmd_sfx(a):
    print(f"{make_sfx(a.outdir, a.seed)} files in {a.outdir}")


def parser():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("beats"); p.add_argument("audio"); p.add_argument("-o")
    p = sub.add_parser("snap"); p.add_argument("beats"); p.add_argument("cuts"); p.add_argument("-o")
    p.add_argument("--preset", required=True, choices=PRESETS); p.add_argument("--fps", type=float, default=30)
    p = sub.add_parser("sfx"); p.add_argument("outdir"); p.add_argument("--seed", type=int, default=7)
    p = sub.add_parser("mix"); p.add_argument("video"); p.add_argument("cues")
    p.add_argument("--preset", required=True, choices=PRESETS); p.add_argument("--music"); p.add_argument("--force-music", action="store_true")
    p.add_argument("--sfx-dir")
    p.add_argument("-o", default="."); p.add_argument("--seed", type=int, default=7)
    p = sub.add_parser("detect"); p.add_argument("video"); p.add_argument("-o"); p.add_argument("--threshold", type=float, default=0.2)
    p = sub.add_parser("cut"); p.add_argument("video"); p.add_argument("snapped"); p.add_argument("-o", default="cut.mp4"); p.add_argument("--fps", type=float, default=30)
    p = sub.add_parser("loud"); p.add_argument("file")
    sub.add_parser("presets")
    return ap


def main(argv):
    a = parser().parse_args(argv)
    run_cmd = dict(beats=cmd_beats, snap=cmd_snap, sfx=cmd_sfx, cut=cmd_cut, detect=lambda a: emit(a, detect_cuts(a.video, a.threshold)), mix=cmd_mix, presets=lambda a: print(presets_table()),
                   loud=lambda a: print(fmt(a.file, measure(a.file))))
    try:
        run_cmd[a.cmd](a)
    except (ValueError, FileNotFoundError, json.JSONDecodeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
