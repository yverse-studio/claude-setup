"""ready.py: a video folder passes only with script, storyboard, sound plan and Critic passes."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import ready  # noqa: E402

SCRIPT = "Hook: the result first.\n\n| Time | Picture |\n|---|---|\n| 0.0-1.0 | island |\n\nPayoff at 8 s.\n"
BOARD = "| Shot | Still | Time | Camera | Sound cue |\n|---|---|---|---|---|\n| 1 | stills/01.png | 0.0-1.0 | push in | whoosh |\n"
SOUND = "Music bed: Morning Walk\nSource: pixabay.com/music/123\nLicence: Pixabay Content License\n"
CRITIC = "PASS animatic 2026-10-18 refs: tiktok.com/@a/1, tiktok.com/@b/2\nPASS cut 2026-10-18 refs: tiktok.com/@a/1, tiktok.com/@b/2\n"


class Ready(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        (self.dir / "stills").mkdir()
        (self.dir / "stills" / "01.png").write_bytes(b"")
        for name, text in (("script.md", SCRIPT), ("storyboard.md", BOARD), ("sound.md", SOUND), ("critic.md", CRITIC)):
            (self.dir / name).write_text(text, encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, text):
        (self.dir / name).write_text(text, encoding="utf-8")

    def test_complete_folder_is_ready(self):
        self.assertEqual(ready.problems(self.dir), [])
        self.assertEqual(ready.main(["ready.py", str(self.dir)]), 0)

    def test_empty_folder_lists_every_missing_file(self):
        with tempfile.TemporaryDirectory() as empty:
            found = ready.problems(empty)
        self.assertEqual(len(found), 4)
        self.assertEqual(ready.main(["ready.py", empty]), 1)

    def test_script_needs_payoff(self):
        self.write("script.md", SCRIPT.replace("Payoff", "End"))
        self.assertEqual(ready.problems(self.dir), ["script: no payoff"])

    def test_every_shot_needs_a_real_still(self):
        self.write("storyboard.md", BOARD + "| 2 | | 1.0-2.0 | hold | none |\n| 3 | stills/03.png | 2.0-3.0 | pan | pop |\n")
        self.assertEqual(ready.problems(self.dir), ["storyboard: shot 2 has no still", "storyboard: shot 3 still not found (stills/03.png)"])

    def test_sound_needs_licence(self):
        self.write("sound.md", "Music bed: something nice\n")
        self.assertEqual(ready.problems(self.dir), ["sound: no filled 'Licence:' line for the music bed"])

    def test_critic_needs_both_passes_with_references(self):
        self.write("critic.md", "FAIL animatic: hook too slow\nPASS cut refs: tiktok.com/@a/1\n")
        self.assertEqual(ready.problems(self.dir), [
            "critic: no PASS line for the animatic",
            "critic: the cut PASS line names fewer than 2 reference videos after 'refs:'",
        ])


if __name__ == "__main__":
    unittest.main()
