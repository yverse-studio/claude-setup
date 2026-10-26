"""sound.py: snap logic, SFX cap and takes, presets, loudnorm parsing, cue validation. Stdlib only; numpy/ffmpeg tests skip."""
import importlib
import math
import shutil
import sys
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sound = importlib.import_module("sound")

try:
    import numpy
except ImportError:
    numpy = None

GRID = [i * 0.5 for i in range(40)]
BEATS = {"beats": GRID, "downbeats": GRID[::4], "strong_cues": [{"t": 4.1, "score": 0.9}]}
BIG, EXPLAINER, TALK = (sound.PRESETS[k] for k in ("big", "explainer", "real_talk"))
STDERR = """[Parsed_loudnorm_0 @ 0x1] \n{
\t"input_i" : "-24.40",
\t"input_tp" : "-3.70",
\t"input_lra" : "2.80",
\t"input_thresh" : "-34.90",
\t"output_i" : "-15.00",
\t"normalization_type" : "dynamic",
\t"target_offset" : "0.10"
}
"""


def snap(cuts, preset=EXPLAINER, fps=30):
    return sound.snap_cuts(BEATS, cuts, preset, fps)


class Presets(unittest.TestCase):
    def test_keys_and_values(self):
        self.assertEqual(set(sound.PRESETS), {"real_talk", "explainer", "big"})
        self.assertEqual((TALK["sfx_cap"], EXPLAINER["sfx_cap"], BIG["sfx_cap"]), (2, 4, 8))
        self.assertEqual((TALK["bed_db"], TALK["duck_db"], TALK["music"]), (-20, 12, True))
        self.assertEqual(sound.LOUDNESS, dict(lufs=-14, tp=-1.5, lra=11))

    def test_table_names_every_preset(self):
        table = sound.presets_table()
        for name in sound.PRESETS:
            self.assertIn(f"| {name} |", table)


class Snap(unittest.TestCase):
    def test_moves_within_tolerance(self):
        r = snap([2.05])[0]
        self.assertTrue(r["moved"])
        self.assertEqual(r["to"], 2.0)

    def test_leaves_outside_tolerance(self):
        r = snap([2.2])[0]
        self.assertFalse(r["moved"])
        self.assertIn("no beat", r["reason"])

    def test_frames_at_30_fps(self):
        grid = {"beats": [2.01]}
        r = sound.snap_cuts(grid, [2.0], EXPLAINER, 30)[0]
        self.assertEqual(r["frame"], 60)
        self.assertAlmostEqual(r["to"] * 30, round(r["to"] * 30), places=2)

    def test_hook_prefers_strong_cue(self):
        r = snap([{"t": 4.0, "kind": "hook"}], BIG)[0]
        self.assertEqual(r["to"], 4.1)
        self.assertIn("strong cue", r["reason"])

    def test_payoff_falls_back_to_downbeat(self):
        r = snap([{"t": 6.05, "kind": "payoff"}], BIG)[0]
        self.assertEqual(r["to"], 6.0)
        self.assertIn("downbeat", r["reason"])

    def test_plain_cut_ignores_strong_cue(self):
        self.assertEqual(snap([4.1], BIG)[0]["to"], 4.0)

    def test_min_shot_respected(self):
        out = snap([2.0, 3.02, 4.1])
        self.assertEqual(out[1]["to"], 3.0333)  # snapping to 3.0 would shrink a gap already below min_shot
        out = snap([2.02, 3.48, 5.55])
        self.assertEqual([r["to"] for r in out], [2.0, 3.5, 5.5])
        gaps = [b["to"] - a["to"] for a, b in zip(out, out[1:])]
        self.assertTrue(all(g >= EXPLAINER["min_shot"] - 1e-6 for g in gaps))

    def test_snap_never_closes_a_gap_below_min_shot(self):
        out = snap([2.0, 3.55], EXPLAINER)
        self.assertGreaterEqual(out[1]["to"] - out[0]["to"], EXPLAINER["min_shot"] - 1e-6)

    def test_order_kept(self):
        cuts = [1.02, 2.97, 4.05, 6.96, 9.0]
        out = [r["to"] for r in snap(cuts, BIG)]
        self.assertEqual(out, sorted(out))

    def test_bad_cut_raises(self):
        with self.assertRaises(ValueError):
            snap(["x"])
        with self.assertRaises(ValueError):
            snap([{"t": 1, "kind": "wow"}])


class Cues(unittest.TestCase):
    KINDS = {"pop": ["pop_1", "pop_2", "pop_3"], "hit": ["hit_1", "hit_2"], "tick": ["tick_1"]}

    def cues(self, n):
        return [{"t": i, "sfx": "pop"} for i in range(n)]

    def test_cap_lists_excess(self):
        errors = sound.validate_cues(self.cues(3), TALK, self.KINDS)
        self.assertEqual(len(errors), 1)
        self.assertIn("cap is 2", errors[0])
        self.assertIn("cue 2", errors[0])
        self.assertEqual(sound.validate_cues(self.cues(2), TALK, self.KINDS), [])

    def test_validation_errors(self):
        bad = [{"t": -1, "sfx": "pop"}, {"t": 1, "sfx": "nope"}, {"t": 2, "sfx": "pop", "gain_db": 20}, 5]
        errors = sound.validate_cues(bad, BIG, self.KINDS)
        self.assertEqual([e[:6] for e in errors].count("cue 3:"), 2)  # a non-object has no t and no sfx
        self.assertEqual(len(errors), 5)
        self.assertEqual(len(sound.validate_cues({}, BIG, self.KINDS)), 1)

    def test_never_same_take_twice(self):
        for seed in range(30):
            picked = sound.pick_takes(self.cues(8), self.KINDS, seed)
            files = [f for _, f in picked]
            self.assertTrue(all(a != b for a, b in zip(files, files[1:])), files)

    def test_single_take_repeat_is_an_error(self):
        with self.assertRaises(ValueError):
            sound.pick_takes([{"t": 1, "sfx": "tick"}, {"t": 2, "sfx": "tick"}], self.KINDS)

    def test_graph_has_ducking_only_with_music(self):
        picked = sound.pick_takes(self.cues(2), self.KINDS)
        self.assertNotIn("sidechaincompress", sound.build_graph(picked, True, False, BIG, 10))
        self.assertIn("sidechaincompress", sound.build_graph(picked, True, True, BIG, 10))


class DuckThreshold(unittest.TestCase):
    def test_derivation_follows_the_compressor_formula(self):
        for duck in (10, 12, 14):
            thr = sound.duck_threshold(-20, duck)
            over = -20 - 20 * math.log10(thr)  # dB the voice sits above the threshold
            self.assertAlmostEqual(over * (1 - 1 / sound.DUCK_RATIO) + sound.DUCK_BIAS_DB, duck, places=3)

    def test_deeper_duck_lowers_threshold_and_louder_voice_raises_it(self):
        self.assertLess(sound.duck_threshold(-20, 14), sound.duck_threshold(-20, 10))
        self.assertGreater(sound.duck_threshold(-14, 12), sound.duck_threshold(-20, 12))

    def test_no_voice_or_no_duck_uses_default_and_result_is_clamped(self):
        self.assertEqual(sound.duck_threshold(None, 12), 0.05)
        self.assertEqual(sound.duck_threshold(-20, None), 0.05)
        self.assertEqual(sound.duck_threshold(40, 12), 1.0)
        self.assertEqual(sound.duck_threshold(-120, 12), 0.001)


class Loudnorm(unittest.TestCase):
    def test_parse(self):
        m = sound.parse_loudnorm(STDERR)
        self.assertEqual(m["input_i"], -24.4)
        self.assertEqual(m["target_offset"], 0.1)

    def test_no_json_raises(self):
        with self.assertRaises(ValueError):
            sound.parse_loudnorm("nothing here")

    def test_second_pass_uses_measured_values(self):
        f = sound.loudnorm_filter(sound.parse_loudnorm(STDERR))
        self.assertIn("measured_I=-24.4", f)
        self.assertIn("linear=true", f)


def read_wav(path):
    with wave.open(str(path)) as w:
        return (w.getframerate(), w.getnchannels(), w.getsampwidth()), numpy.frombuffer(w.readframes(w.getnframes()), "<i2") / 32768


@unittest.skipUnless(numpy, "numpy missing")
class Sfx(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        sound.main(["sfx", str(cls.dir)])

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_library(self):
        self.assertEqual(len(list(self.dir.glob("*.wav"))), len(sound.SECONDS) * sound.TAKES)
        self.assertTrue((self.dir / "LICENCE.txt").is_file())
        self.assertTrue((self.dir / "manifest.json").is_file())

    def test_no_cartoony_kinds(self):
        self.assertFalse(list(self.dir.glob("pop_*")) + list(self.dir.glob("scratch_*")))
        self.assertEqual(set(sound.SECONDS), {"hit", "thud", "tick", "whoosh_up", "whoosh_down", "riser", "boom"})

    def test_every_file_is_clean(self):
        for f in sorted(self.dir.glob("*.wav")):
            fmt, x = read_wav(f)
            self.assertEqual(fmt, (48000, 1, 2), f.name)
            self.assertAlmostEqual(20 * numpy.log10(abs(x).max()), -3, delta=0.1, msg=f.name)
            self.assertLess(abs(x[0]), 0.001, f.name)  # starts at zero
            tail = abs(x[-int(sound.SR * 0.005):]).max()
            self.assertLess(20 * numpy.log10(max(tail, 1e-9)), -40, f.name)  # last 5 ms is quiet
            self.assertLess(abs(x.mean()), 0.01, f.name)

    def test_riser_ends_quiet_not_at_full_level(self):
        _, x = read_wav(self.dir / "riser_1.wav")
        self.assertLess(abs(x[-int(sound.SR * 0.03):]).max(), 0.15 * abs(x).max())


@unittest.skipUnless(shutil.which("ffmpeg") and numpy, "ffmpeg or numpy missing")
class MixAndLoud(unittest.TestCase):
    def tone_file(self, d, x):
        path = Path(d) / "src.wav"
        sound.write_wav(path, x, numpy)
        return path

    def test_music_detection_flags_a_beat_but_not_speech_like_bursts(self):
        rng, n = numpy.random.default_rng(3), sound.SR * 15
        t = numpy.arange(n) / sound.SR
        kick = numpy.exp(-(t % 0.5) / 0.08) * numpy.sin(2 * numpy.pi * 60 * t)
        bed = 0.5 * kick + 0.1 * numpy.sin(2 * numpy.pi * 330 * t) + 0.02 * rng.standard_normal(n)
        speech = numpy.zeros(n)
        pos = 0
        while pos < n - sound.SR:
            length = int(sound.SR * rng.uniform(0.08, 0.3))
            speech[pos:pos + length] = numpy.sin(2 * numpy.pi * rng.uniform(100, 250) * numpy.arange(length) / sound.SR) * numpy.hanning(length)
            pos += length + int(sound.SR * (rng.uniform(0.03, 0.5) if rng.random() < 0.3 else rng.uniform(0.02, 0.12)))
        with tempfile.TemporaryDirectory() as d:
            self.assertTrue(sound.looks_like_music(sound.music_features(self.tone_file(d, bed))))
            self.assertFalse(sound.looks_like_music(sound.music_features(self.tone_file(d, speech))))

    def test_mix_refuses_a_bed_on_a_source_with_music(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            t = numpy.arange(sound.SR * 12) / sound.SR
            src = self.tone_file(d, 0.5 * numpy.exp(-(t % 0.5) / 0.08) * numpy.sin(2 * numpy.pi * 60 * t) + 0.1 * numpy.sin(2 * numpy.pi * 330 * t))
            video = Path(d) / "v.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=12", "-i", str(src), "-shortest", str(video)], check=True)
            (Path(d) / "cues.json").write_text("[]")
            (Path(d) / "sfx").mkdir()
            args = ["mix", str(video), f"{d}/cues.json", "--preset", "big", "--sfx-dir", f"{d}/sfx", "-o", f"{d}/out", "--music", str(src)]
            with self.assertRaises(SystemExit) as err:
                sound.main(args)
            self.assertIn("--force-music", str(err.exception))
            self.assertIn("voice-only", str(err.exception))

    def test_bed_drops_about_duck_db_under_voice(self):
        import subprocess
        rng, n = numpy.random.default_rng(1), sound.SR * 16
        t = numpy.arange(n) / sound.SR
        gate = (t // 2 % 2 == 0)  # 2 s voice, 2 s silence
        voice = numpy.sin(2 * numpy.pi * 180 * t) * (0.6 + 0.4 * numpy.sin(2 * numpy.pi * 4 * t)) * gate
        voice *= 10 ** (-20 / 20) / numpy.sqrt((voice[gate] ** 2).mean())
        for name, preset in sound.PRESETS.items():
            with tempfile.TemporaryDirectory() as d:
                sound.write_wav(Path(d) / "v.wav", voice, numpy)
                sound.write_wav(Path(d) / "b.wav", rng.standard_normal(n) * 10 ** (-30 / 20), numpy)
                thr = sound.duck_threshold(sound.measure(Path(d) / "v.wav")["input_i"], preset["duck_db"])
                graph = f"[1:a][0:a]sidechaincompress=threshold={thr:.5f}:ratio={sound.DUCK_RATIO}:attack=20:release=400[o]"
                out = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{d}/v.wav", "-i", f"{d}/b.wav", "-filter_complex", graph,
                                      "-map", "[o]", "-f", "f32le", "-ac", "1", "-ar", str(sound.SR), "-"], capture_output=True, check=True).stdout
            y = numpy.frombuffer(out, "<f4")

            def level(a, b):
                return 20 * numpy.log10(numpy.sqrt((y[int(a * sound.SR):int(b * sound.SR)] ** 2).mean()))
            drop = numpy.mean([level(k * 4 + 3, k * 4 + 3.9) for k in (1, 2, 3)]) - numpy.mean([level(k * 4 + 0.6, k * 4 + 1.9) for k in range(4)])
            self.assertAlmostEqual(drop, preset["duck_db"], delta=1.5, msg=name)

    def test_loud_measures_a_tone(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            wav = Path(d) / "t.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=440:d=3", str(wav)], check=True)
            m = sound.measure(wav)
            self.assertLess(m["input_i"], 0)


if __name__ == "__main__":
    unittest.main()
