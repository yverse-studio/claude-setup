"""publicmeta: only https links on the platform's own hosts are fetched."""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))

import publicmeta as pm

EMBED = ('<div class="Caption"><a class="CaptionUsername"><span class="UsernameText">bob</span></a> '
         'hello <b>world</b> <a>View all 1,234 comments</a></div><div class="CaptionComments">')


class Meta(unittest.TestCase):
    def test_foreign_and_http_hosts_are_ignored(self):
        with mock.patch.object(pm, '_get') as get:
            self.assertIsNone(pm.fetch('https://evil.example/watch?v=1'))
            self.assertIsNone(pm.fetch('http://www.youtube.com/watch?v=1'))
            self.assertIsNone(pm.fetch('file:///etc/passwd'))
            get.assert_not_called()

    def test_instagram_caption(self):
        with mock.patch.object(pm, '_get', return_value=EMBED):
            info = pm.fetch('https://www.instagram.com/reel/abc123/')
        self.assertEqual((info['uploader'], info['title']), ('bob', 'hello world'))

    def test_instagram_profile_link_has_no_post(self):
        with mock.patch.object(pm, '_get') as get:
            self.assertIsNone(pm.fetch('https://www.instagram.com/bob/'))
            get.assert_not_called()

    def test_network_error_gives_none(self):
        with mock.patch.object(pm, '_get', side_effect=OSError('down')):
            self.assertIsNone(pm.fetch('https://www.youtube.com/watch?v=1'))


if __name__ == '__main__':
    unittest.main()
