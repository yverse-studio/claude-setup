---
name: media-editing
description: Edit video and photos on demand with free open-source tools: cut, caption, grade, loudness, crop, background removal, free transcripts. Use when a task needs a clip or image changed.
---

# Media editing

Install on demand in a scratch dir, never in the repo or the cloud environment; delete after. Verdict
and trial: `research/video-tools/2026-10-11.md` (project files). Checked 2026-10-11.

## Pick

| Job | Tool | Status |
|---|---|---|
| Cut, join, crop, grade, captions, loudness | plain **ffmpeg** (already in cloud threads) | proven, 5-line recipe below |
| Cut list + grade + burned captions in one render | **video-use** (browser-use, MIT) | proven; read its SKILL.md and helpers first |
| Free transcript + SRT (no key) | **faster-whisper** (MIT) | proven 2026-10-11, tiny model loads in cloud |
| Photo crop, resize, colour | **Pillow** | proven |
| Background removal | **rembg** (`u2net`; `birefnet-general` is sharper but 1 GB and slow on CPU) | u2net proven, birefnet untested |
| Upscale (Real-ESRGAN), auto-editor silence cuts | - | installable, not tried: say so, test on one file first |

Not tools for threads: Artcraft (desktop GUI apps, rough alpha), Bria RMBG-2.0 (non-commercial licence).

## Video (ffmpeg)

```bash
# 1 cut 1s..5s, 9:16 crop, light grade, burned SRT, -14 LUFS (tested)
ffmpeg -ss 1 -to 5 -i in.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920,eq=contrast=1.1:saturation=1.15,subtitles=c.srt:force_style='FontName=DejaVu Sans,Bold=1,Outline=2'" -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac out.mp4
# 2 join clips of the same codec: list.txt holds lines  file 'a.mp4'
ffmpeg -f concat -safe 0 -i list.txt -c copy joined.mp4
# 3 free transcript to SRT (own venv; av must be 15.x on Python 3.13)
python3 -m venv /tmp/w && /tmp/w/bin/pip -q install faster-whisper "av==15.*"
/tmp/w/bin/python -I - <<'PY' > c.srt
from faster_whisper import WhisperModel
t = lambda x: f"{int(x//3600):02}:{int(x%3600//60):02}:{int(x%60):02},{int(x%1*1000):03}"
for n, s in enumerate(WhisperModel("small", compute_type="int8").transcribe("in.mp4", language="de")[0], 1):
    print(f"{n}\n{t(s.start)} --> {t(s.end)}\n{s.text.strip()}\n")
PY
# 4 check: ffprobe -v error -show_entries stream=width,height,duration -of csv=p=0 out.mp4, then look at one frame (ffmpeg -ss 2 -i out.mp4 -frames:v 1 f.jpg)
# 5 video-use for longer edits: git clone --depth 1 https://github.com/browser-use/video-use /tmp/vu, read SKILL.md, then python3 -I helpers/render.py edl.json -o out.mp4
```

## Photo (Pillow, rembg)

```bash
python3 -m venv /tmp/p && /tmp/p/bin/pip -q install pillow "rembg[cpu]" onnxruntime   # first run downloads a ~170 MB model, ~2 min
/tmp/p/bin/python -I -c "from PIL import Image,ImageOps,ImageEnhance as E;i=ImageOps.fit(Image.open('in.jpg').convert('RGB'),(1080,1080));E.Contrast(i).enhance(1.1).save('out.webp',quality=85)"   # crop+resize+colour
/tmp/p/bin/rembg i in.jpg cut.png   # background removal, transparent PNG
# check: open the result, check size and edges (hair, glass); keep originals untouched
# licence: only the user's own or licence-clean images; no paid character models in git
```

## Hands (yskills only, never ask unprompted)

- Paid transcript keys (ElevenLabs for video-use, Deepgram): faster-whisper does the job free. If a key is wanted, one card; it goes into Actions or Worker secrets, never chat.
- Image or video generation (fal.ai, Higgsfield): money and a new service, see `toolbox` `catalog/video-audio.md`; wait for the tap.
- Posting or sending the result anywhere.
