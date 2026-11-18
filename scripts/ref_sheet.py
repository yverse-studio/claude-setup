#!/usr/bin/env python3
"""Reference sheet for a look or scene gate (GameDev 2026-11-18, docs/LESSONS-2026-11-17.md).

Builds ONE jpg: the real in-scene still(s) first, then the owner refs, the BlobCG refs and the approved
sheet, all at the same height, each row labelled. A gate scores only after this sheet exists; a T-pose
beside nothing is no look check. Exits 1 when a group is empty, so a missing ref source stops the gate.

  python3 scripts/ref_sheet.py --still still.png [--still ...] \
      --adult-refs /mnt/project-files/gate/adult-refs \
      --blobcg lib/characters/CH_Base/work/bodytypes/refs \
      --sheet approved_sheet.png --out gate/<name>-vs-REFS.jpg [--height 640] [--max 6]
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw

EXT = ('.png', '.jpg', '.jpeg', '.webp')


def files(spec, limit):
    if os.path.isdir(spec):
        found = sorted(os.path.join(spec, f) for f in os.listdir(spec) if f.lower().endswith(EXT))
    else:
        found = [spec] if os.path.isfile(spec) and spec.lower().endswith(EXT) else []
    return found[:limit]


def build(groups, out, height=640, pad=8, label_h=28):
    rows = []
    for name, paths in groups:
        ims = []
        for p in paths:
            im = Image.open(p).convert('RGB')
            ims.append(im.resize((max(1, round(im.width * height / im.height)), height), Image.LANCZOS))
        rows.append((name, ims))
    width = max(sum(i.width for i in ims) + pad * (len(ims) + 1) for _, ims in rows)
    total = sum(label_h + height + pad for _ in rows) + pad
    sheet = Image.new('RGB', (width, total), (24, 24, 28))
    draw = ImageDraw.Draw(sheet)
    y = pad
    for name, ims in rows:
        draw.text((pad, y + 6), f'{name} ({len(ims)})', fill=(235, 235, 235))
        y += label_h
        x = pad
        for im in ims:
            sheet.paste(im, (x, y))
            x += im.width + pad
        y += height + pad
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    sheet.save(out, 'JPEG', quality=88)
    return sheet.size


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--still', action='append', default=[], help='the real in-scene still (repeatable), the thing the gate scores')
    ap.add_argument('--adult-refs', required=True, help="the owner's refs (folder or file), gate/adult-refs")
    ap.add_argument('--blobcg', required=True, help='BlobCG refs (folder or file)')
    ap.add_argument('--sheet', required=True, help='the approved cast or look sheet (file)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--height', type=int, default=640)
    ap.add_argument('--max', type=int, default=6, help='refs per group')
    a = ap.parse_args(argv)
    groups = [('IN-SCENE STILL', [p for s in a.still for p in files(s, a.max)]),
              ('OWNER REFS (adult-refs)', files(a.adult_refs, a.max)),
              ('BlobCG REFS', files(a.blobcg, a.max)),
              ('APPROVED SHEET', files(a.sheet, 1))]
    empty = [n for n, p in groups if not p]
    if empty:
        print('ref_sheet: no images for ' + ', '.join(empty) + '; no gate score without all four groups', file=sys.stderr)
        return 1
    w, h = build(groups, a.out, a.height)
    print(f'ref_sheet: {a.out} {w}x{h}, ' + ', '.join(f'{n}: {len(p)}' for n, p in groups))
    return 0


if __name__ == '__main__':
    sys.exit(main())
