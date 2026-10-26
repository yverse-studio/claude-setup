import json
import tempfile
import unittest
from pathlib import Path

from sound_library import problems

CLEAN = {
    "id": "thud-soft-01", "kind": "sfx", "category": "thud", "licence": "CC0-1.0",
    "url": "https://kenney.nl/assets/impact-sounds", "proof": "licences/kenney/License.txt",
    "file": "sfx/thud/thud-soft-01.wav", "presets": ["explainer"], "tags": ["warm"], "lufs": -20.0,
}


def library(entries, files=("licences/kenney/License.txt", "sfx/thud/thud-soft-01.wav")):
    root = Path(tempfile.mkdtemp())
    for name in files:
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text("x")
    (root / "manifest.json").write_text(json.dumps({"entries": entries}))
    return root


class Check(unittest.TestCase):
    def test_clean_entry_passes(self):
        self.assertEqual(problems(library([CLEAN])), [])

    def test_cc_by_is_rejected(self):
        found = problems(library([{**CLEAN, "licence": "CC-BY-4.0"}]))
        self.assertTrue(any("licence" in line for line in found))

    def test_missing_proof_is_rejected(self):
        found = problems(library([CLEAN], files=("sfx/thud/thud-soft-01.wav",)))
        self.assertTrue(any("proof" in line for line in found))

    def test_music_needs_bpm_and_known_mood(self):
        music = {**CLEAN, "kind": "music", "mood": "elevator", "file": CLEAN["file"]}
        found = problems(library([music]))
        self.assertTrue(any("bpm" in line for line in found))
        self.assertTrue(any("group" in line for line in found))

    def test_unknown_preset_and_duplicate_id(self):
        found = problems(library([{**CLEAN, "presets": ["vlog"]}, CLEAN]))
        self.assertTrue(any("presets" in line for line in found))
        self.assertTrue(any("duplicate" in line for line in found))


if __name__ == "__main__":
    unittest.main()
