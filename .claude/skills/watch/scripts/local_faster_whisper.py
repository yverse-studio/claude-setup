"""Free CPU transcription with faster-whisper (claude-setup addition, 2026-10-17).

No key and no 1.5 GB managed venv: `pip install faster-whisper` is enough, which is
what makes the local engine produce a transcript in a fresh cloud thread. ffmpeg
decodes the audio, so faster-whisper's own PyAV decoder (which breaks on some
PyAV versions) is never used.
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys

from transcribe import Segments, normalize_segments

SAMPLE_RATE = 16000


def available() -> bool:
    return importlib.util.find_spec('faster_whisper') is not None


def decode_pcm(video_path: str) -> bytes:
    """Mono 16 kHz signed 16-bit PCM from ffmpeg's stdout."""
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', video_path,
           '-vn', '-ac', '1', '-ar', str(SAMPLE_RATE), '-f', 's16le', '-']
    try:
        result = subprocess.run(cmd, capture_output=True, check=False)
    except OSError:
        raise SystemExit('ffmpeg is not installed.') from None
    if result.returncode != 0 or not result.stdout:
        raise SystemExit(f"ffmpeg audio decode failed: {result.stderr.decode('utf-8', 'replace').strip()[:500]}")
    return result.stdout


def to_segments(raw) -> Segments:
    """faster-whisper segments → the shared {start, end, text} shape; blank text dropped."""
    rows = [{'start': float(s.start), 'end': float(s.end), 'text': s.text.strip()} for s in raw]
    return normalize_segments({'segments': [r for r in rows if r['text']]})


def transcribe_audio(video_path: str, model: str = 'small') -> Segments:
    if not available():
        raise SystemExit('faster-whisper is not installed. Run: python3 -m pip install faster-whisper')
    import numpy
    from faster_whisper import WhisperModel

    audio = numpy.frombuffer(decode_pcm(video_path), dtype='<i2').astype('float32') / 32768
    print(f'[watch] faster-whisper {model} on CPU…', file=sys.stderr, flush=True)
    raw, info = WhisperModel(model, device='cpu', compute_type='int8').transcribe(audio)
    segments = to_segments(raw)
    print(f'[watch] faster-whisper: {len(segments)} segments, language {info.language}', file=sys.stderr)
    return segments
