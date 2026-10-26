"""Speak a script in yskills' voice (Chatterbox) and check every sentence with faster-whisper.

Runs inside the chatterbox venv; twin.py calls it. A sentence whose transcript is off by more than
--max-wer is generated again (up to RETRIES times); if it still fails, the run fails: no wrong words ship.
Usage: python voice.py SCRIPT.txt REF.wav OUT.wav WORDS.json [--exaggeration 0.5] [--cfg 0.5] [--max-wer 0.08]
"""
import argparse
import json
import os

import torch
import torchaudio as ta
from chatterbox.tts import ChatterboxTTS
from faster_whisper import WhisperModel

from twin import split_sentences, word_error_rate

RETRIES = 2
GAP_S = 0.18          # breath between sentences
WHISPER = "small.en"


def transcribe(whisper, wav, sr, offset, path):
    ta.save(path, wav, sr)
    segments, _ = whisper.transcribe(path, word_timestamps=True, language="en")
    words = [{"word": w.word.strip(), "start": w.start + offset, "end": w.end + offset}
             for seg in segments for w in seg.words]
    return " ".join(w["word"] for w in words), words


def main():
    ap = argparse.ArgumentParser()
    for a in ("script", "ref", "out", "words"):
        ap.add_argument(a)
    ap.add_argument("--exaggeration", type=float, default=0.5)
    ap.add_argument("--cfg", type=float, default=0.5)
    ap.add_argument("--max-wer", type=float, default=0.08)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tts = ChatterboxTTS.from_pretrained(device=device)
    whisper = WhisperModel(WHISPER, device=device, compute_type="int8_float16" if device == "cuda" else "int8")
    sentences = split_sentences(open(args.script, encoding="utf-8").read())
    scratch = os.path.join(os.path.dirname(os.path.abspath(args.out)), "_sentence.wav")  # stays in the run folder
    gap = torch.zeros(1, int(tts.sr * GAP_S))
    pieces, words, offset, errors = [], [], 0.0, []
    for sentence in sentences:
        for attempt in range(RETRIES + 1):
            wav = tts.generate(sentence, audio_prompt_path=args.ref,
                               exaggeration=args.exaggeration, cfg_weight=args.cfg)
            heard, found = transcribe(whisper, wav, tts.sr, offset, scratch)
            wer = word_error_rate(sentence, heard)
            if wer <= args.max_wer:
                break
            print(f"retry {attempt + 1}: '{sentence}' heard as '{heard}' (WER {wer:.2f})", flush=True)
        errors.append(wer)
        pieces += [wav, gap]
        words += found
        offset += wav.shape[-1] / tts.sr + GAP_S
    if os.path.exists(scratch):
        os.remove(scratch)
    ta.save(args.out, torch.cat(pieces[:-1], dim=-1), tts.sr)
    worst = max(errors, default=0.0)
    json.dump({"wer": worst, "words": words}, open(args.words, "w", encoding="utf-8"), indent=1)
    if worst > args.max_wer:
        raise SystemExit(f"voice failed: a sentence stays at WER {worst:.2f} after {RETRIES} retries")


if __name__ == "__main__":
    main()
