"""Timeline pass: parsers are pure; one end-to-end run when ffmpeg is installed."""
import array
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import timeline as tl  # noqa: E402


class Parsers(unittest.TestCase):
    def test_showinfo_times(self):
        err = "[Parsed_showinfo_1] n:0 pts:30 pts_time:1.001 x\n[Parsed_showinfo_1] n:1 pts:60 pts_time:2.5 y"
        self.assertEqual(tl.parse_showinfo(err), [1.0, 2.5])

    def test_silences_pair_and_open_end(self):
        err = "silence_start: 1.2\nsilence_end: 2.0 | silence_duration: 0.8\nsilence_start: 4.5\n"
        self.assertEqual(tl.parse_silences(err, 5.0), [{"start": 1.2, "end": 2.0}, {"start": 4.5, "end": 5.0}])

    def test_loudness_json(self):
        err = 'junk\n{\n "input_i" : "-16.20",\n "input_tp" : "-1.0"\n}\n'
        self.assertEqual(tl.parse_loudness(err), -16.2)
        self.assertIsNone(tl.parse_loudness('{"input_i" : "-inf"}'))

    def test_hits_on_loud_frames(self):
        energy = [1.0] * 50
        for i in (10, 35):
            energy[i] = 100.0
        self.assertEqual(tl.find_hits(energy), [0.2, 0.7])

    def test_tempo_and_beat_share(self):
        hits = [0.5 * i for i in range(10)]
        self.assertEqual(tl.tempo(hits), 120)
        self.assertEqual(tl.on_beat_share([1.0, 1.23], hits), 0.5)
        self.assertIsNone(tl.on_beat_share([], hits))

    def test_pacing(self):
        p = tl.pacing([1.0, 3.0], 6.0)
        self.assertEqual(p, {"cuts": 2, "average_shot": 2.0, "longest_shot": 3.0, "cuts_in_hook": 1})

    def test_report_lists_events(self):
        t = {"duration": 3, "cuts": [1.0], "hits": [1.0], "silences": [], "loudness_lufs": -14.0,
             "tempo_bpm": None, "pacing": tl.pacing([1.0], 3), "cuts_on_beat": 1.0}
        text = "\n".join(tl.format_report(t))
        self.assertIn("Cuts on a hit:** 100%", text)
        self.assertIn("| 1.00 | cut |", text)


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
class EndToEnd(unittest.TestCase):
    def test_synthetic_clip(self):
        # 3 colour shots of 1 s; beeps at 0.5 s and 2.0 s, silence elsewhere.
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "clip.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-f", "lavfi", "-i", "color=red:s=160x284:d=1:r=30",
                "-f", "lavfi", "-i", "color=blue:s=160x284:d=1:r=30",
                "-f", "lavfi", "-i", "color=green:s=160x284:d=1:r=30",
                "-f", "lavfi", "-i", "aevalsrc='if(between(t,0.5,0.7)+between(t,2.0,2.2),sin(2*PI*880*t),0)':s=44100:d=3",
                "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
                "-map", "[v]", "-map", "3:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out),
            ], check=True)
            t = tl.analyze(str(out), 3.0)
        self.assertEqual(len(t["cuts"]), 2)
        self.assertTrue(all(abs(c - e) < 0.1 for c, e in zip(t["cuts"], [1.0, 2.0])))
        self.assertTrue(any(abs(h - 0.5) < 0.1 for h in t["hits"]))
        self.assertTrue(any(abs(h - 2.0) < 0.1 for h in t["hits"]))
        self.assertTrue(t["silences"])


if __name__ == "__main__":
    unittest.main()
