#!/usr/bin/env python3
"""Official public metadata when yt-dlp is refused: YouTube oEmbed, Instagram's embed caption.

Only title, author and cover, never the video: it keeps the cheap scan alive while the laptop route
(SKILL.md, step 1.2) gets the media. Plain HTTPS to the platform's own embed endpoints, https hosts only.
"""
from __future__ import annotations

import html
import json
import re
import urllib.request
from urllib.parse import quote, urlparse

UA = 'claude-setup-watch/1.0 (+https://github.com/yverse-studio/claude-setup)'
YT_HOSTS = ('youtube.com', 'youtu.be')
IG_PATH = re.compile(r'^/(?:[\w.]+/)?(p|reel|reels|tv)/([\w-]+)')


def _host_is(url: str, *domains: str) -> bool:
    parts = urlparse(url)
    host = (parts.hostname or '').lower()
    return parts.scheme == 'https' and any(host == d or host.endswith('.' + d) for d in domains)


def _get(url: str, limit: int = 2_000_000) -> str:
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(request, timeout=20) as resp:  # https only: callers checked the host
        return resp.read(limit).decode('utf-8', 'replace')


def youtube(url: str) -> dict | None:
    data = json.loads(_get(f'https://www.youtube.com/oembed?format=json&url={quote(url, safe="")}', 200_000))
    return {'title': data.get('title'), 'uploader': data.get('author_name'), 'duration': None, 'url': url,
            'cover': data.get('thumbnail_url'), 'source': 'youtube-oembed'}


def instagram(url: str) -> dict | None:
    match = IG_PATH.match(urlparse(url).path)
    if not match:
        return None
    page = _get(f'https://www.instagram.com/{match.group(1)}/{match.group(2)}/embed/captioned/')
    block = re.search(r'<div class="Caption">(.*?)</div>\s*(?:<div class="CaptionComments"|</div>)', page, re.S)
    if not block:
        return None
    text = html.unescape(re.sub(r'<[^>]+>', ' ', block.group(1)))
    text = re.sub(r'\s+', ' ', text).strip()
    user = re.search(r'class="UsernameText">([^<]+)<', page)
    handle = user.group(1) if user else None
    if handle and text.startswith(handle + ' '):
        text = text[len(handle) + 1:]
    text = re.sub(r'\s*View all [\d,.]+ comments\s*$', '', text)
    return {'title': text or None, 'uploader': handle, 'duration': None, 'url': url,
            'cover': None, 'source': 'instagram-embed'}


def fetch(url: str) -> dict | None:
    """Public metadata for a YouTube or Instagram link, or None when there is none to give."""
    try:
        if _host_is(url, *YT_HOSTS):
            return youtube(url)
        if _host_is(url, 'instagram.com'):
            return instagram(url)
    except (OSError, ValueError):
        return None
    return None
