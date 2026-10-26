"""TikTok page route: parse the embedded JSON, refuse challenge pages, never impersonate."""
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))

import tiktok

ITEM = {'id': '1', 'desc': 'hi #x', 'author': {'uniqueId': 'bob'}, 'stats': {'playCount': 5},
        'video': {'duration': 9, 'playAddr': 'https://v.example/a.mp4', 'cover': 'c'}}


def page(item):
    data = {'__DEFAULT_SCOPE__': {'webapp.video-detail': {'itemInfo': {'itemStruct': item}}}}
    return f'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{json.dumps(data)}</script>'.encode()


def fake_opener(body):
    resp = mock.MagicMock()
    resp.__enter__.return_value = resp
    resp.read.return_value = body
    opener = mock.MagicMock()
    opener.open.return_value = resp
    return opener


class Page(unittest.TestCase):
    def test_host_check(self):
        self.assertTrue(tiktok.is_tiktok('https://vm.tiktok.com/abc/'))
        self.assertFalse(tiktok.is_tiktok('https://nottiktok.com/x'))

    def test_summary_from_page(self):
        item, _ = tiktok.fetch_item('https://www.tiktok.com/x', fake_opener(page(ITEM)))
        info = tiktok.summary(item, 'u')
        self.assertEqual((info['uploader'], info['duration'], info['title']), ('bob', 9, 'hi #x'))

    def test_challenge_page_is_refused(self):
        with self.assertRaises(tiktok.TikTokUnavailable):
            tiktok.fetch_item('https://www.tiktok.com/x', fake_opener(b'<html>verify you are human</html>'))

    def test_private_post_without_video(self):
        with self.assertRaises(tiktok.TikTokUnavailable):
            tiktok.fetch_item('https://www.tiktok.com/x', fake_opener(page({**ITEM, 'video': {}})))


if __name__ == '__main__':
    unittest.main()
