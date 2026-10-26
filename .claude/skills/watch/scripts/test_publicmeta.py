"""publicmeta: only https links on the platform's own hosts are fetched."""
import email.message
import io
import os
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))

import download as dl
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

    def test_non_dict_oembed_gives_none(self):
        with mock.patch.object(pm, '_get', return_value='[1, 2]'):
            self.assertIsNone(pm.youtube('https://www.youtube.com/watch?v=1'))

    def test_redirect_off_platform_is_refused(self):
        class Redirect(urllib.request.BaseHandler):
            def https_open(self, req):
                headers = email.message.Message()
                headers['Location'] = 'https://evil.example/steal'
                resp = urllib.request.addinfourl(io.BytesIO(b''), headers, req.full_url, 302)
                resp.msg = 'Found'
                return resp
        with mock.patch.object(pm.tiktok.urllib.request, 'HTTPSHandler', Redirect):
            with self.assertRaises(OSError):
                pm._get('https://www.youtube.com/oembed?url=x')
            self.assertIsNone(pm.fetch('https://www.youtube.com/watch?v=1'))


class CaptionsFallback(unittest.TestCase):
    def run_fetch(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(dl, '_run', side_effect=SystemExit('yt-dlp failed: 429')), \
                mock.patch.object(dl.publicmeta, 'fetch', return_value={'title': 'T', 'source': 'x'}) as fetch:
            result = dl.fetch_captions('https://www.youtube.com/watch?v=1', Path(tmp))
        return result, fetch

    def test_public_meta_used_when_ytdlp_gave_none(self):
        result, fetch = self.run_fetch()
        fetch.assert_called_once()
        self.assertEqual(result['info']['title'], 'T')

    def test_ytdlp_metadata_wins_when_only_the_caption_step_failed(self):
        calls = []

        def run(cmd):
            calls.append(cmd)
            if len(calls) == 1:
                return None
            raise SystemExit('caption step failed')
        info = {'title': 'real', 'subtitles': {'en': [{'ext': 'vtt'}]}}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(dl, '_run', side_effect=run), \
                mock.patch.object(dl, '_read_metadata', return_value=info), \
                mock.patch.object(dl.publicmeta, 'fetch') as fetch:
            result = dl.fetch_captions('https://www.youtube.com/watch?v=1', Path(tmp))
        fetch.assert_not_called()
        self.assertEqual(result['info']['title'], 'real')


class LaptopHint(unittest.TestCase):
    def hint(self, remote):
        env = {'CLAUDE_CODE_REMOTE': 'true'} if remote else {}
        with mock.patch.dict(os.environ, env, clear=False):
            if not remote:
                os.environ.pop('CLAUDE_CODE_REMOTE', None)
            return dl.network_diagnostic('ERROR: unable to download video data: HTTP Error 403: Forbidden')

    def test_next_step_in_cloud(self):
        self.assertIn('NEXT:', self.hint(True))

    def test_no_next_step_on_the_laptop(self):
        self.assertNotIn('NEXT:', self.hint(False))


if __name__ == '__main__':
    unittest.main()
