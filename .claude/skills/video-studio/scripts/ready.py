"""Exit 0 only when a video folder has what the pipeline requires before delivery.

Usage: python ready.py <video folder>   (the project's video/<slug>/)

Checks: script.md with hook, payoff and time ranges; storyboard.md with an existing still on every shot row; sound.md with a filled
Licence line; critic.md with a PASS line for the animatic and for the cut, each naming at
least two reference videos after "refs:". Stdlib only.
"""
import re
import sys
from pathlib import Path

TIME_RANGE = re.compile(r"\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?")
STILL = re.compile(r"[\w./-]+\.(?:png|jpe?g|webp)", re.I)
LICENCE = re.compile(r"licen[cs]e\**\s*:\**[ \t]*[^\s<]", re.I)
PASS = re.compile(r"^\W*PASS\b(.*)$", re.I | re.M)
MIN_REFS = 2


def read(path):
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def check_script(folder):
    text = read(folder / "script.md")
    if not text:
        return ["script: no script.md"]
    return [f"script: {need}" for need, ok in (
        ("no hook", re.search(r"\bhook\b", text, re.I)),
        ("no payoff", re.search(r"\bpayoff\b", text, re.I)),
        ("no time ranges (two-column script, e.g. 0.0-1.0)", TIME_RANGE.search(text)),
    ) if not ok]


def shot_rows(text):
    rows = []
    for line in text.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if line.lstrip().startswith("|") and cells and re.fullmatch(r"\d+", cells[0]):
            rows.append((cells[0], line))
    return rows


def check_storyboard(folder):
    text = read(folder / "storyboard.md")
    if not text:
        return ["storyboard: no storyboard.md"]
    rows = shot_rows(text)
    if not rows:
        return ["storyboard: no shot rows (a table row starting with the shot number)"]
    errors = []
    for shot, line in rows:
        stills = STILL.findall(line)
        if not stills:
            errors.append(f"storyboard: shot {shot} has no still")
        elif not any((folder / s).is_file() for s in stills):
            errors.append(f"storyboard: shot {shot} still not found ({stills[0]})")
    return errors


def check_sound(folder):
    text = read(folder / "sound.md")
    if not text:
        return ["sound: no sound.md"]
    return [] if LICENCE.search(text) else ["sound: no filled 'Licence:' line for the music bed"]


def ref_count(line):
    parts = re.split(r"\brefs:", line, maxsplit=1, flags=re.I)
    return len([r for r in parts[1].split(",") if r.strip()]) if len(parts) == 2 else 0


def check_critic(folder):
    text = read(folder / "critic.md")
    if not text:
        return ["critic: no critic.md"]
    errors = []
    for stage in ("animatic", "cut"):
        lines = [m.group(1) for m in PASS.finditer(text) if re.match(rf"\W*{stage}\b", m.group(1), re.I)]
        if not lines:
            errors.append(f"critic: no PASS line for the {stage}")
        elif max(ref_count(line) for line in lines) < MIN_REFS:
            errors.append(f"critic: the {stage} PASS line names fewer than {MIN_REFS} reference videos after 'refs:'")
    return errors


def problems(folder):
    folder = Path(folder)
    if not folder.is_dir():
        return [f"{folder}: not a folder"]
    return check_script(folder) + check_storyboard(folder) + check_sound(folder) + check_critic(folder)


def main(argv):
    if len(argv) != 2:
        print("usage: python ready.py <video folder>")
        return 2
    found = problems(argv[1])
    for p in found:
        print(f"MISSING {p}")
    print("not ready: stop and send it back to the step that owns it" if found else "ready")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
