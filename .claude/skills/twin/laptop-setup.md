# Twin laptop setup (Windows, RTX 4060 8 GB)

Run by a Remote Control session in PowerShell, once. Tools live in `C:\Users\Claude\twin-tools\`
(`TWIN_TOOLS` overrides it); `twin.py doctor` says what is missing. Written 2026-10-26 from the
projects' READMEs; each step gets "(run <date>)" once it worked on the laptop, and any fix goes here.

1. `ffmpeg -version` and `nvidia-smi` answer; else `winget install Gyan.FFmpeg`. `uv --version`;
   else `winget install astral-sh.uv`.
2. Chatterbox (MIT) with faster-whisper, Python 3.11:
   ```
   mkdir C:\Users\Claude\twin-tools\chatterbox; cd C:\Users\Claude\twin-tools\chatterbox
   uv venv --python 3.11 .venv
   uv pip install --python .venv chatterbox-tts faster-whisper
   uv pip install --python .venv torch torchaudio --index-url https://download.pytorch.org/whl/cu124 --reinstall
   ```
   The last line swaps in CUDA torch when the first pulled the CPU build; check with
   `.venv\Scripts\python -c "import torch; print(torch.cuda.is_available())"`.
3. MuseTalk 1.5 (MIT code), Python 3.10, torch 2.0.1 + cu118 as its README pins:
   ```
   cd C:\Users\Claude\twin-tools; git clone https://github.com/TMElyralab/MuseTalk; cd MuseTalk
   uv venv --python 3.10 .venv
   uv pip install --python .venv torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
   uv pip install --python .venv -r requirements.txt
   uv pip install --python .venv --no-build-isolation openmim
   .venv\Scripts\mim install mmengine "mmcv==2.0.1" "mmdet==3.1.0" "mmpose==1.1.0"
   .venv\Scripts\python -m pip install huggingface_hub
   download_weights.bat
   ```
   Weights end in `models\musetalkV15\unet.pth`. mmcv on Windows is the usual trouble spot: when
   `mim` has no wheel, use the prebuilt wheel for cu118/torch2.0 from the OpenMMLab index.
4. Optional, LatentSync 1.5 (Apache-2.0, 8 GB minimum per its README): clone
   `bytedance/LatentSync`, venv per its `setup_env.sh`, and download the **1.5** checkpoints
   (`huggingface-cli download ByteDance/LatentSync-1.5 --local-dir checkpoints`); the 1.6 ones need ~18 GB.
5. Smoke test before yskills' files exist: `python twin.py doctor`, then MuseTalk's own demo
   (`data\video\yongen.mp4` with a Chatterbox line in its default voice) through
   `node scripts\laptop-job.mjs --name twin-smoke --timeout-min 30 -- <python> twin.py say ...`
   on a temp twin folder; note seconds per output second and peak VRAM here.
