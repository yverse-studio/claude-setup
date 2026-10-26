#!/usr/bin/env python3
"""TikTok without yt-dlp: read the public watch page's own embedded JSON, then fetch the video file it names.

Plain HTTPS with an honest user agent and the page's own session cookie, exactly what a browser's
first load does. No impersonation, no login, no challenge solving: if TikTok shows a challenge or
the post is private, the page has no data and we raise, and the caller moves on to the next
fallback (laptop route, then his screenshot). Public posts only.
"""
from __future__ import annotations

import http.cookiejar
import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

UA = 'claude-setup-watch/1.0 (+https://github.com/yverse-studio/claude-setup)'
MAX_BYTES = 200_000_000
DATA_RE = re.compile(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', re.S)


# The page is untrusted data: only https URLs on TikTok's own domains are ever followed.
ALLOWED_DOMAINS = ('tiktok.com', 'tiktokcdn.com', 'tiktokcdn-us.com')


def _allowed(url: str) -> bool:
    parts = urlparse(url)
    host = (parts.hostname or '').lower()
    return parts.scheme == 'https' and any(host == d or host.endswith('.' + d) for d in ALLOWED_DOMAINS)


def is_tiktok(url: str) -> bool:
    host = (urlparse(url).hostname or '').lower()
    return host == 'tiktok.com' or host.endswith('.tiktok.com')


class TikTokUnavailable(Exception):
    pass


class _SameFamilyRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _allowed(newurl):
            raise urllib.error.URLError(f'redirect to a non-TikTok host refused: {urlparse(newurl).hostname}')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _opener() -> urllib.request.OpenerDirector:
    # Built from scratch: https and cookies only, no file:, ftp: or data: handlers.
    opener = urllib.request.OpenerDirector()
    for handler in (urllib.request.HTTPSHandler(), _SameFamilyRedirects(), urllib.request.HTTPErrorProcessor(),
                    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())):
        opener.add_handler(handler)
    return opener


def fetch_item(url: str, opener=None) -> tuple[dict, urllib.request.OpenerDirector]:
    """Return the video's itemStruct from the watch page (short vm./vt. links are followed)."""
    opener = opener or _opener()
    if not _allowed(url):
        raise TikTokUnavailable('not an https TikTok link')
    try:
        with opener.open(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as resp:
            html = resp.read(5_000_000).decode('utf-8', 'replace')
    except OSError as exc:
        raise TikTokUnavailable(f'TikTok page not reachable: {exc}') from None
    match = DATA_RE.search(html)
    if not match:
        raise TikTokUnavailable('TikTok page has no video data (challenge page, login wall or private post)')
    try:
        scope = json.loads(match.group(1))['__DEFAULT_SCOPE__']
        item = scope['webapp.video-detail']['itemInfo']['itemStruct']
    except (ValueError, KeyError, TypeError):
        raise TikTokUnavailable('TikTok page has no readable video (removed, private or age-restricted)') from None
    if not item.get('video', {}).get('playAddr'):
        raise TikTokUnavailable('TikTok post has no public video file')
    if not _allowed(item['video']['playAddr']):
        raise TikTokUnavailable('TikTok video file is on an unexpected host, refused')
    return item, opener


def summary(item: dict, url: str) -> dict:
    author = item.get('author') or {}
    video = item.get('video') or {}
    handle = author.get('uniqueId')
    return {'title': item.get('desc') or None, 'uploader': handle, 'duration': video.get('duration'),
            'url': f'https://www.tiktok.com/@{handle}/video/{item["id"]}' if handle and item.get('id') else url,
            'stats': item.get('stats') or {}, 'music': (item.get('music') or {}).get('title'),
            'cover': video.get('originCover') or video.get('cover'), 'source': 'tiktok-page'}


def download(url: str, run_dir: Path) -> dict:
    """Fetch metadata and the mp4 into run_dir; return {'video_path', 'info'}."""
    item, opener = fetch_item(url)
    target = Path(run_dir) / 'video.mp4'
    size = 0
    request = urllib.request.Request(item['video']['playAddr'], headers={'User-Agent': UA, 'Referer': 'https://www.tiktok.com/'})
    try:
        with opener.open(request, timeout=60) as resp, open(target, 'wb') as out:
            while chunk := resp.read(1 << 20):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise TikTokUnavailable('TikTok video larger than 200 MB, skipped')
                out.write(chunk)
    except OSError as exc:
        target.unlink(missing_ok=True)
        raise TikTokUnavailable(f'TikTok video file refused: {exc}') from None
    except TikTokUnavailable:
        target.unlink(missing_ok=True)
        raise
    if size == 0:
        target.unlink(missing_ok=True)
        raise TikTokUnavailable('TikTok video file was empty')
    return {'video_path': str(target.resolve()), 'info': summary(item, url)}
