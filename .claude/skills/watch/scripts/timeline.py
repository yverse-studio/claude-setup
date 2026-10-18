"""Edit timeline for a short video: scene cuts, audio hits, silences, loudness, pacing.

claude-setup, 2026-10-18: frames plus a transcript miss how a video is cut and sounds.
This pass reads the cut the way an editor does, with ffmpeg and the standard library only.
"""
from __future__ import annotations

import array
import json
import re
import shutil
import subprocess
from statistics import median

SCENE_THRESHOLD = 0.3     # ffmpeg scene score that counts as a hard cut
SILENCE_DB = -35          # quieter than this is silence
SILENCE_MIN = 0.3         # seconds; shorter gaps are breaths, not pauses
RATE = 8000               # audio sample rate for the hit pass
HOP = 0.02                # seconds per energy frame
HIT_RATIO = 1.8           # a frame this much louder than the last 0.5 s is a hit
HIT_GAP = 0.12            # seconds between two hits
SYNC_WINDOW = 0.08        # a cut this close to a hit is on the beat
HOOK_SECONDS = 2.0


def parse_showinfo(stderr: str) -> list[float]:
    return [round(float(t), 2) for t in re.findall(r"pts_time:([0-9.]+)", stderr)]


def parse_silences(stderr: str, duration: float) -> list[dict]:
    out, start = [], None
    for kind, value in re.findall(r"silence_(start|end): (-?[0-9.]+)", stderr):
        if kind == "start":
            start = max(0.0, float(value))
        elif start is not None:
            out.append({"start": round(start, 2), "end": round(float(value), 2)})
            start = None
    if start is not None and duration > start:
        out.append({"start": round(start, 2), "end": round(duration, 2)})
    return out


def parse_loudness(stderr: str) -> float | None:
    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr, re.S)
    if not match:
        return None
    try:
        value = float(json.loads(match.group(0))["input_i"])
    except (ValueError, KeyError):
        return None
    return value if value > -70 else None


def energy_frames(samples: array.array, rate: int = RATE, hop: float = HOP) -> list[float]:
    size = max(1, int(rate * hop))
    return [sum(s * s for s in samples[i:i + size]) / size for i in range(0, len(samples) - size + 1, size)]


def find_hits(energy: list[float], hop: float = HOP) -> list[float]:
    """Onsets: frames much louder than the recent past (drums, SFX, a word after a pause)."""
    look = max(1, int(0.5 / hop))
    floor = max(energy, default=0) * 0.02
    hits, last = [], -1.0
    for i, value in enumerate(energy):
        past = energy[max(0, i - look):i]
        mean = sum(past) / len(past) if past else 0.0
        t = i * hop
        if value > floor and value > HIT_RATIO * mean and t - last >= HIT_GAP:
            hits.append(round(t, 2))
            last = t
    return hits


def tempo(hits: list[float]) -> int | None:
    gaps = [b - a for a, b in zip(hits, hits[1:]) if 0.25 <= b - a <= 1.5]
    if len(gaps) < 4:
        return None
    return round(60 / median(gaps))


def on_beat_share(cuts: list[float], hits: list[float]) -> float | None:
    if not cuts or not hits:
        return None
    synced = sum(1 for c in cuts if any(abs(c - h) <= SYNC_WINDOW for h in hits))
    return round(synced / len(cuts), 2)


def pacing(cuts: list[float], duration: float) -> dict:
    shots = [b - a for a, b in zip([0.0, *cuts], [*cuts, duration]) if b > a]
    return {
        "cuts": len(cuts),
        "average_shot": round(sum(shots) / len(shots), 2) if shots else None,
        "longest_shot": round(max(shots), 2) if shots else None,
        "cuts_in_hook": sum(1 for c in cuts if c <= HOOK_SECONDS),
    }


def _ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise SystemExit("ffmpeg not found; the timeline needs it")
    return exe


def _run(args: list[str], stdout=subprocess.DEVNULL) -> subprocess.CompletedProcess:
    return subprocess.run(args, stdout=stdout, stderr=subprocess.PIPE, check=False)


def _stderr(proc: subprocess.CompletedProcess) -> str:
    return proc.stderr.decode("utf-8", "replace")


def analyze(video_path: str, duration: float, has_video: bool = True, has_audio: bool = True) -> dict:
    ff = _ffmpeg()
    base = [ff, "-hide_banner", "-nostats", "-i", str(video_path)]
    result = {"duration": round(duration, 2), "cuts": [], "hits": [], "silences": [],
              "loudness_lufs": None, "tempo_bpm": None}
    if has_video:
        proc = _run(base + ["-an", "-vf", f"select='gt(scene,{SCENE_THRESHOLD})',showinfo", "-f", "null", "-"])
        result["cuts"] = [t for t in parse_showinfo(_stderr(proc)) if 0 < t < duration]
    if has_audio:
        proc = _run(base + ["-vn", "-af", f"silencedetect=noise={SILENCE_DB}dB:d={SILENCE_MIN}", "-f", "null", "-"])
        result["silences"] = parse_silences(_stderr(proc), duration)
        proc = _run(base + ["-vn", "-af", "loudnorm=print_format=json", "-f", "null", "-"])
        result["loudness_lufs"] = parse_loudness(_stderr(proc))
        proc = _run(base + ["-vn", "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"], stdout=subprocess.PIPE)
        samples = array.array("h")
        samples.frombytes(proc.stdout[: len(proc.stdout) // 2 * 2])
        result["hits"] = find_hits(energy_frames(samples))
        result["tempo_bpm"] = tempo(result["hits"])
    result["pacing"] = pacing(result["cuts"], duration)
    result["cuts_on_beat"] = on_beat_share(result["cuts"], result["hits"])
    return result


def format_report(t: dict, segments: list[dict] | None = None) -> list[str]:
    p = t["pacing"]
    silent = sum(s["end"] - s["start"] for s in t["silences"])
    lines = [
        f"- **Cuts:** {p['cuts']} (average shot {p['average_shot']} s, longest {p['longest_shot']} s, "
        f"{p['cuts_in_hook']} in the first {HOOK_SECONDS:g} s)",
        f"- **Audio hits:** {len(t['hits'])}" + (f", about {t['tempo_bpm']} BPM" if t["tempo_bpm"] else ""),
        f"- **Cuts on a hit:** {int(t['cuts_on_beat'] * 100)}%" if t["cuts_on_beat"] is not None else "- **Cuts on a hit:** n/a",
        f"- **Silence:** {round(silent, 1)} s in {len(t['silences'])} gaps over {SILENCE_MIN} s",
        f"- **Loudness:** {t['loudness_lufs']} LUFS (TikTok target about -14)" if t["loudness_lufs"] is not None
        else "- **Loudness:** n/a",
    ]
    if segments:
        words = sum(len(s["text"].split()) for s in segments)
        spoken = sum(s["end"] - s["start"] for s in segments)
        if spoken > 0:
            lines.append(f"- **Speech:** {round(words / spoken * 60)} words per minute while talking")
    events = [(c, "cut") for c in t["cuts"]] + [(h, "hit") for h in t["hits"]]
    events += [(s["start"], f"silence {round(s['end'] - s['start'], 1)} s") for s in t["silences"]]
    if events:
        lines += ["", "| t | event |", "|---|---|"]
        lines += [f"| {e[0]:.2f} | {e[1]} |" for e in sorted(events)[:120]]
    return lines
