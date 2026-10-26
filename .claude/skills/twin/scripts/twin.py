"""yskills' digital twin: his recorded face and voice, re-voiced with a new script.

Usage (on the laptop, see ../laptop-setup.md):
  python twin.py check RAW_DIR                 raw recordings good enough? exit 1 with the problems
  python twin.py prep RAW_DIR TWIN_DIR         voice references + mood clips + twin.json
  python twin.py say TWIN_DIR --text "..." --mood talk --out OUT_DIR [--engine musetalk|latentsync] [--voice-only]
  python twin.py doctor                        tools, GPU and folders present?

`say` writes OUT_DIR/voice.wav, face.mp4 (unless --voice-only), report.json and critic/ (side-by-side
frames and lip-closure frames for the Critic). The heavy models run in their own venvs as separate
processes, one after the other, so 8 GB RAM and 8 GB VRAM are enough. Stdlib only here.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = Path(os.environ.get("TWIN_TOOLS", Path.home() / "twin-tools"))
FFMPEG = os.environ.get("TWIN_FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("TWIN_FFPROBE", "ffprobe")

VOICE_FILES = ("voice-calm", "voice-hyped", "voice-free")
FACE_FILE = "face-base-01"
AUDIO_EXT = (".wav", ".m4a", ".flac", ".aif", ".aiff", ".mp3")
VIDEO_EXT = (".mov", ".mp4", ".m4v")

MIN_SAMPLE_RATE = 44100
MIN_VOICE_S = {"voice-calm": 240, "voice-hyped": 120, "voice-free": 600}
MAX_PEAK_DB = -1.0          # louder means clipping
MAX_NOISE_FLOOR_DB = -50.0  # quieter rooms read lower
MIN_FACE_S = 170
MIN_SHORT_SIDE = 1080
MIN_FPS = 24
REF_SECONDS = 12            # Chatterbox clones from a ~10 s clean clip
MUSETALK_FPS = 25           # MuseTalk was trained on 25 fps
MAX_FACE_S = 8              # twin face on screen in short bursts only (SKILL.md, Hard rule)
MAX_WER = 0.08              # more wrong words than this and the take is rejected
CLOSURE_LETTERS = ("b", "p", "m")

# Order of the one face take in record.md: (mood, start s, end s).
FACE_PLAN = (("neutral", 0, 30), ("talk", 30, 90), ("smile", 90, 120), ("think", 120, 150), ("hyped", 150, 180))
# Which voice reference and face clip each mood uses.
MOODS = {
    "talk": ("voice-free", "talk"),
    "calm": ("voice-calm", "talk"),
    "hyped": ("voice-hyped", "hyped"),
    "think": ("voice-calm", "think"),
}
# Chatterbox knobs per mood (README: defaults 0.5/0.5; more exaggeration speeds speech, lower cfg slows it).
VOICE_KNOBS = {"talk": (0.5, 0.5), "calm": (0.4, 0.5), "hyped": (0.7, 0.3), "think": (0.4, 0.5)}


# ---------- pure helpers (tested) ----------

def split_sentences(text):
    parts = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
    return [p for p in parts if p]


def normalize_words(text):
    return re.findall(r"[a-z0-9']+", text.lower().replace("-", " "))


def word_error_rate(reference, hypothesis):
    ref, hyp = normalize_words(reference), normalize_words(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h))
        prev = cur
    return prev[-1] / len(ref)


def judge_audio(name, info):
    problems = []
    if info["sample_rate"] < MIN_SAMPLE_RATE:
        problems.append(f"{name}: {info['sample_rate']} Hz, needs {MIN_SAMPLE_RATE}+ (Voice Memos set to Lossless)")
    need = MIN_VOICE_S.get(name, 0)
    if info["duration"] < need:
        problems.append(f"{name}: {info['duration']:.0f} s, needs {need}+ s")
    if info["peak_db"] > MAX_PEAK_DB:
        problems.append(f"{name}: clipping (peak {info['peak_db']:.1f} dB), phone a bit further from the mouth")
    if info["noise_floor_db"] > MAX_NOISE_FLOOR_DB:
        problems.append(f"{name}: noisy room (floor {info['noise_floor_db']:.0f} dB), close window, fan off")
    return problems


def judge_video(info):
    problems = []
    w, h = info["width"], info["height"]
    if info.get("rotation") in (90, -90, 270, -270):
        w, h = h, w
    if w > h:
        problems.append(f"{FACE_FILE}: landscape {w}x{h}, needs vertical")
    if min(w, h) < MIN_SHORT_SIDE:
        problems.append(f"{FACE_FILE}: {w}x{h}, needs 1080p or 4K")
    if info["fps"] < MIN_FPS:
        problems.append(f"{FACE_FILE}: {info['fps']:.1f} fps, needs 24+")
    if info["duration"] < MIN_FACE_S:
        problems.append(f"{FACE_FILE}: {info['duration']:.0f} s, needs the full ~3 min take")
    return problems


def parse_silences(stderr):
    """[(start, end)] from ffmpeg silencedetect output."""
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", stderr)]
    return list(zip(starts, ends))


def best_window(silences, duration, length=REF_SECONDS):
    """Start and end of the reference clip: starts and ends in a pause, holds the most speech."""
    edges = [0.0] + [e for _, e in silences]
    best = None
    for start in edges:
        stops = [s for s, _ in silences if start + length * 0.8 <= s <= start + length * 1.3]
        if not stops or start + length * 0.8 > duration:
            continue
        stop = min(stops, key=lambda s: abs(s - start - length))
        pause = sum(max(0.0, min(e, stop) - max(s, start)) for s, e in silences)
        speech = (stop - start) - pause
        if best is None or speech > best[2]:
            best = (round(start, 2), round(stop, 2), speech)
    return None if best is None else best[:2]


def face_segments(duration):
    return [{"mood": m, "start": s, "end": min(e, duration)} for m, s, e in FACE_PLAN if s < duration]


def pick_clip(manifest, mood, seconds):
    if seconds > MAX_FACE_S:
        raise SystemExit(f"script is {seconds:.1f} s, a twin face shot is {MAX_FACE_S} s at most: "
                         "split it, --voice-only over real footage, or real footage (SKILL.md, Hard rule)")
    _, clip_mood = MOODS[mood]
    clip = manifest["face"].get(clip_mood)
    if not clip:
        raise SystemExit(f"no '{clip_mood}' face clip in twin.json; run prep again")
    if clip["seconds"] < seconds:
        raise SystemExit(f"script is {seconds:.1f} s, the '{clip_mood}' face clip only {clip['seconds']:.0f} s: "
                         "shorter script, voice-only over real footage, or real footage (SKILL.md, Hard rule)")
    return clip


def closure_times(words):
    """Times where the lips must close (b, p, m at a word start): the Critic checks these frames."""
    return [round(w["start"], 2) for w in words if w["word"].strip().lower().startswith(CLOSURE_LETTERS)]


def musetalk_config(video, audio):
    return f'task_0:\n  video_path: "{str(video).replace(chr(92), "/")}"\n  audio_path: "{str(audio).replace(chr(92), "/")}"\n'


def venv_python(tool_dir):
    win = Path(tool_dir) / ".venv" / "Scripts" / "python.exe"
    return win if os.name == "nt" else Path(tool_dir) / ".venv" / "bin" / "python"


# ---------- media ----------

def run(cmd, cwd=None):
    print("  $", " ".join(str(c) for c in cmd), flush=True)
    done = subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if done.returncode:
        sys.stderr.write(done.stderr[-3000:])
        raise SystemExit(f"step failed: {Path(str(cmd[0])).name} (exit {done.returncode})")
    return done


def find(raw_dir, stem, exts):
    hits = [p for p in Path(raw_dir).iterdir() if p.stem.lower() == stem and p.suffix.lower() in exts]
    return hits[0] if hits else None


def probe(path):
    out = run([FFPROBE, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path]).stdout
    return json.loads(out)


def audio_info(path):
    data = probe(path)
    stream = next(s for s in data["streams"] if s["codec_type"] == "audio")
    stats = run([FFMPEG, "-hide_banner", "-i", path, "-af", "astats=metadata=0", "-f", "null", "-"]).stderr
    peak = re.findall(r"Peak level dB: (-?[\d.]+|-inf)", stats)
    floor = re.findall(r"Noise floor dB: (-?[\d.]+|-inf)", stats)
    num = lambda xs, d: max((float(x) for x in xs if x != "-inf"), default=d)
    return {"sample_rate": int(stream["sample_rate"]), "duration": float(data["format"]["duration"]),
            "peak_db": num(peak, -99.0), "noise_floor_db": num(floor, -99.0)}


def video_info(path):
    data = probe(path)
    s = next(s for s in data["streams"] if s["codec_type"] == "video")
    num, den = (int(x) for x in s["avg_frame_rate"].split("/"))
    rot = int(s.get("tags", {}).get("rotate", 0)) or next(
        (int(d.get("rotation", 0)) for d in s.get("side_data_list", []) if "rotation" in d), 0)
    return {"width": s["width"], "height": s["height"], "fps": num / den if den else 0,
            "duration": float(data["format"]["duration"]), "rotation": rot}


def seconds_of(path):
    return float(probe(path)["format"]["duration"])


# ---------- commands ----------

def cmd_check(args):
    problems = []
    for name in VOICE_FILES:
        path = find(args.raw, name, AUDIO_EXT)
        problems += [f"{name}: missing"] if not path else judge_audio(name, audio_info(path))
    face = find(args.raw, FACE_FILE, VIDEO_EXT)
    problems += [f"{FACE_FILE}: missing"] if not face else judge_video(video_info(face))
    for p in problems:
        print("PROBLEM", p)
    print("CHECK OK" if not problems else f"CHECK FAIL: {len(problems)} problem(s)")
    return 1 if problems else 0


def cmd_prep(args):
    raw, out = Path(args.raw), Path(args.twin)
    (out / "voice").mkdir(parents=True, exist_ok=True)
    (out / "face").mkdir(parents=True, exist_ok=True)
    manifest = {"voice": {}, "face": {}}
    for name in VOICE_FILES:
        src = find(raw, name, AUDIO_EXT)
        if not src:
            raise SystemExit(f"{name} missing in {raw}")
        full = out / "voice" / f"{name}.wav"
        run([FFMPEG, "-y", "-i", src, "-ac", "1", "-ar", "48000", "-af", "highpass=f=70", full])
        detect = run([FFMPEG, "-hide_banner", "-i", full, "-af", "silencedetect=n=-40dB:d=0.35", "-f", "null", "-"]).stderr
        window = best_window(parse_silences(detect), seconds_of(full))
        if not window:
            raise SystemExit(f"{name}: no clean {REF_SECONDS} s stretch found")
        ref = out / "voice" / f"{name}-ref.wav"
        run([FFMPEG, "-y", "-ss", window[0], "-t", round(window[1] - window[0], 2), "-i", full, ref])
        manifest["voice"][name] = {"ref": ref.name, "from": window}
    face = find(raw, FACE_FILE, VIDEO_EXT)
    if not face:
        raise SystemExit(f"{FACE_FILE} missing in {raw}")
    for seg in face_segments(video_info(face)["duration"]):
        clip = out / "face" / f"{seg['mood']}.mp4"
        run([FFMPEG, "-y", "-ss", seg["start"], "-t", seg["end"] - seg["start"], "-i", face, "-vf",
             f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps={MUSETALK_FPS}",
             "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-an", clip])
        manifest["face"][seg["mood"]] = {"file": f"face/{clip.name}", "seconds": seg["end"] - seg["start"]}
    (out / "twin.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"PREP OK {out / 'twin.json'}")
    return 0


def make_voice(twin, manifest, text, mood, out):
    ref_name, _ = MOODS[mood]
    ref = twin / "voice" / manifest["voice"][ref_name]["ref"]
    exaggeration, cfg = VOICE_KNOBS[mood]
    (out / "script.txt").write_text(text, encoding="utf-8")
    py = venv_python(TOOLS / "chatterbox")
    run([py, HERE / "voice.py", out / "script.txt", ref, out / "voice.wav", out / "words.json",
         "--exaggeration", exaggeration, "--cfg", cfg, "--max-wer", MAX_WER])
    return json.loads((out / "words.json").read_text(encoding="utf-8"))


def lipsync(engine, clip, voice, out):
    face = out / "face.mp4"
    if engine == "musetalk":
        tool = TOOLS / "MuseTalk"
        cfg = out / "musetalk.yaml"
        cfg.write_text(musetalk_config(clip, voice), encoding="utf-8")
        results = out / "musetalk"
        run([venv_python(tool), "-m", "scripts.inference", "--inference_config", cfg, "--result_dir", results,
             "--unet_model_path", "models/musetalkV15/unet.pth", "--unet_config", "models/musetalkV15/musetalk.json",
             "--version", "v15", "--ffmpeg_path", Path(shutil.which(FFMPEG) or FFMPEG).parent], cwd=tool)
        made = sorted(results.rglob("*.mp4"), key=lambda p: p.stat().st_mtime)
        if not made:
            raise SystemExit("MuseTalk wrote no video")
        raw = made[-1]
    else:
        tool = TOOLS / "LatentSync"
        raw = out / "latentsync.mp4"
        run([venv_python(tool), "-m", "scripts.inference", "--unet_config_path", "configs/unet/stage2.yaml",
             "--inference_ckpt_path", "checkpoints/latentsync_unet.pt", "--inference_steps", "25",
             "--guidance_scale", "1.5", "--enable_deepcache", "--video_path", clip, "--audio_path", voice,
             "--video_out_path", raw], cwd=tool)
    run([FFMPEG, "-y", "-i", raw, "-i", voice, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "16",
         "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", face])
    return face


def critic_sheets(clip, face, words, out):
    """Base next to twin at the same time (2 fps), plus every lip-closure frame, for the Critic's eyes."""
    sheets = out / "critic"
    sheets.mkdir(exist_ok=True)
    run([FFMPEG, "-y", "-i", clip, "-i", face, "-filter_complex",
         "[0:v]scale=540:-2[a];[1:v]scale=540:-2[b];[a][b]hstack,fps=2", "-shortest",
         sheets / "side-%03d.png"])
    for t in closure_times(words):
        run([FFMPEG, "-y", "-ss", t + 0.04, "-i", face, "-frames:v", "1", sheets / f"closure-{t:06.2f}.png"])


def cmd_say(args):
    twin, out = Path(args.twin), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((twin / "twin.json").read_text(encoding="utf-8"))
    text = Path(args.text_file).read_text(encoding="utf-8") if args.text_file else args.text
    words = make_voice(twin, manifest, text, args.mood, out)
    seconds = seconds_of(out / "voice.wav")
    report = {"mood": args.mood, "seconds": round(seconds, 2), "wer": words["wer"], "engine": None,
              "label": "twin", "critic": "pending"}
    if not args.voice_only:
        clip = twin / pick_clip(manifest, args.mood, seconds)["file"]
        lipsync(args.engine, clip, out / "voice.wav", out)
        critic_sheets(clip, out / "face.mp4", words["words"], out)
        report["engine"] = args.engine
    (out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"SAY OK {out} ({seconds:.1f} s, WER {words['wer']:.2f}); next: the Critic (SKILL.md, Critic)")
    return 0


def cmd_doctor(_args):
    checks = [("ffmpeg", shutil.which(FFMPEG)), ("ffprobe", shutil.which(FFPROBE)),
              ("nvidia-smi", shutil.which("nvidia-smi"))]
    checks += [(f"{t} venv", venv_python(TOOLS / t).exists()) for t in ("chatterbox", "MuseTalk")]
    checks += [("MuseTalk weights", (TOOLS / "MuseTalk/models/musetalkV15/unet.pth").exists()),
               ("LatentSync (optional)", (TOOLS / "LatentSync/checkpoints/latentsync_unet.pt").exists())]
    for name, ok in checks:
        print(("ok   " if ok else "MISS ") + name)
    if shutil.which("nvidia-smi"):
        print(run(["nvidia-smi", "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader"]).stdout.strip())
    return 0 if all(ok for name, ok in checks if "optional" not in name) else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check"); c.add_argument("raw"); c.set_defaults(fn=cmd_check)
    p = sub.add_parser("prep"); p.add_argument("raw"); p.add_argument("twin"); p.set_defaults(fn=cmd_prep)
    s = sub.add_parser("say"); s.add_argument("twin"); s.add_argument("--out", required=True)
    g = s.add_mutually_exclusive_group(required=True); g.add_argument("--text"); g.add_argument("--text-file")
    s.add_argument("--mood", choices=sorted(MOODS), default="talk")
    s.add_argument("--engine", choices=("musetalk", "latentsync"), default="musetalk")
    s.add_argument("--voice-only", action="store_true"); s.set_defaults(fn=cmd_say)
    d = sub.add_parser("doctor"); d.set_defaults(fn=cmd_doctor)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
