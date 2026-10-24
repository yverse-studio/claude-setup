#!/usr/bin/env python3
"""script.json -> out/timing.json + out/voice.wav. Free and local: Piper voice, faster-whisper word times.
Usage: build.py script.json out_dir [voice.onnx]   (voice from huggingface.co/rhasspy/piper-voices)"""
import json, subprocess, sys, wave, os
import numpy as np
from pathlib import Path

GAP = 0.35  # seconds of silence between scenes

def main():
    script = json.load(open(sys.argv[1])); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    voice = sys.argv[3] if len(sys.argv) > 3 else 'v.onnx'
    from faster_whisper import WhisperModel
    model = WhisperModel('base', compute_type='int8')
    pcm, scenes, t = [], [], 0.0
    for i, sc in enumerate(script['scenes']):
        wav = out / f's{i}.wav'
        subprocess.run([sys.executable, '-m', 'piper', '-m', voice, '-f', str(wav)], input=sc['text'].encode(), check=True, capture_output=True)
        with wave.open(str(wav)) as w:
            rate = w.getframerate(); data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        f32 = np.interp(np.arange(0, len(data), rate / 16000), np.arange(len(data)), data).astype(np.float32) / 32768
        segs, _ = model.transcribe(f32, word_timestamps=True)
        words = [{'w': x.word.strip(), 's': round(t + x.start, 3), 'e': round(t + x.end, 3)} for s in segs for x in s.words]
        dur = len(data) / rate
        scenes.append({'visual': sc['visual'], 'start': round(t, 3), 'end': round(t + dur, 3), 'words': words})
        pcm.append(data); pcm.append(np.zeros(int(rate * GAP), dtype=np.int16)); t += dur + GAP
    with wave.open(str(out / 'voice.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(np.concatenate(pcm).tobytes())
    json.dump({'title': script.get('title', ''), 'duration': round(t, 3), 'scenes': scenes}, open(out / 'timing.json', 'w'), indent=1)
    print('duration', round(t, 1))

main()
