"""python -m unittest discover -s .claude/skills/watch/scripts -p "test_*.py" (stdlib only)."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))

import local_faster_whisper as fw  # noqa: E402
from config import get_config  # noqa: E402


def seg(start, end, text):
    return SimpleNamespace(start=start, end=end, text=text)


class ToSegments(unittest.TestCase):
    def test_shared_shape_and_blank_text_dropped(self):
        out = fw.to_segments([seg(0, 1.5, ' Hello '), seg(1.5, 2, '  '), seg(2, 3, 'world')])
        self.assertEqual(list(out), [{'start': 0.0, 'end': 1.5, 'text': 'Hello'},
                                     {'start': 2.0, 'end': 3.0, 'text': 'world'}])
        self.assertFalse(out.no_speech)

    def test_silence_is_no_speech(self):
        self.assertTrue(fw.to_segments([]).no_speech)


class Transcribe(unittest.TestCase):
    def test_missing_package_says_how_to_install(self):
        with mock.patch.object(fw, 'available', return_value=False):
            with self.assertRaisesRegex(SystemExit, 'pip install faster-whisper'):
                fw.transcribe_audio('clip.mp4')


class Config(unittest.TestCase):
    def test_backend_and_model_settings(self):
        env = {'WATCH_WHISPER_BACKEND': 'faster-whisper', 'WATCH_FASTER_WHISPER_MODEL': 'base'}
        with mock.patch.dict(os.environ, env):
            cfg = get_config()
        self.assertEqual((cfg['whisper_backend'], cfg['faster_whisper_model']), ('faster-whisper', 'base'))


if __name__ == '__main__':
    unittest.main()
