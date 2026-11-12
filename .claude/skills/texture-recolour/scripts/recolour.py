"""recolour.py: recolour one part of a garment texture. ID mask from UV islands, HSV change only inside the mask, before/after crop.
  python recolour.py <texture.png> <mesh.obj> --list                       islands with their pixel area
  python recolour.py <texture.png> <mesh.obj> --islands 0,2 --hue 120 [--sat 1.0 --val 1.0 --grow 2] --out <dir>
Writes recoloured.png (alpha kept as is), mask.png, before_after.png (crop around the mask) and prints one JSON line;
exit 1 if any pixel (alpha included) outside the mask changed. Any texture size, square or not.
Needs numpy and Pillow. Hue is weighted by saturation, so near-grey pixels stay grey; value (brightness) is kept unless --val."""
import argparse, json, os, sys
import numpy as np
from PIL import Image


def read_obj_uv(path):
    """(uvs, faces, skipped): faces as lists of 0-based vt indices. A face with any corner without a vt is skipped as a whole (counted)."""
    uvs, faces, skipped = [], [], 0
    for line in open(path, encoding='utf-8', errors='replace'):
        p = line.split()
        if not p: continue
        if p[0] == 'vt': uvs.append((float(p[1]), float(p[2])))
        elif p[0] == 'f':
            corners = [t.split('/') for t in p[1:]]
            if len(corners) < 3: continue
            try: idx = [int(c[1]) for c in corners]
            except (IndexError, ValueError): skipped += 1; continue
            faces.append([i - 1 if i > 0 else len(uvs) + i for i in idx])   # negative = relative to the vt read so far
    ok = [f for f in faces if all(0 <= i < len(uvs) for i in f)]
    return uvs, ok, skipped + len(faces) - len(ok)


def island_ids(faces, n_uv):
    """Island index (0, 1, ...) per face: faces that share a UV vertex are one island (union-find)."""
    parent = list(range(n_uv))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for f in faces:
        for v in f[1:]: parent[find(v)] = find(f[0])
    order = {}
    return [order.setdefault(find(f[0]), len(order)) for f in faces]


def _triangles(uvs, faces, width, height):
    """(face index, row0, row1, col0, col1, inside) per triangle, evaluated only inside the triangle's own bounding box (v up, row 0 = v 1, pixel centres)."""
    for n, f in enumerate(faces):
        for k in range(1, len(f) - 1):
            (x0, y0), (x1, y1), (x2, y2) = uvs[f[0]], uvs[f[k]], uvs[f[k + 1]]
            d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(d) < 1e-12: continue
            c0, c1 = max(int(np.floor(min(x0, x1, x2) * width)) - 1, 0), min(int(np.ceil(max(x0, x1, x2) * width)) + 1, width)
            r0, r1 = max(int(np.floor((1 - max(y0, y1, y2)) * height)) - 1, 0), min(int(np.ceil((1 - min(y0, y1, y2)) * height)) + 1, height)
            if c0 >= c1 or r0 >= r1: continue
            ys, xs = np.mgrid[r0:r1, c0:c1]; px, py = (xs + 0.5) / width, 1 - (ys + 0.5) / height
            u = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / d; v = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / d
            yield n, r0, r1, c0, c1, (u >= -1e-9) & (v >= -1e-9) & (1 - u - v >= -1e-9)


def island_mask(uvs, faces, picked, width, height=None, grow=0, ids=None):
    """Boolean (height, width) mask of the picked islands' triangles. grow = dilation of the mask itself in px."""
    height = height or width; ids = ids or island_ids(faces, len(uvs)); mask = np.zeros((height, width), bool)
    for n, r0, r1, c0, c1, inside in _triangles(uvs, faces, width, height):
        if ids[n] in picked: mask[r0:r1, c0:c1] |= inside
    for _ in range(grow):
        g = mask.copy(); g[1:] |= mask[:-1]; g[:-1] |= mask[1:]; g[:, 1:] |= mask[:, :-1]; g[:, :-1] |= mask[:, 1:]; mask = g
    return mask


def island_areas(uvs, faces, ids, width, height):
    """{island: pixels} in one pass over the triangles (a pixel two islands cover counts for the later one)."""
    label = np.full((height, width), -1, np.int32)
    for n, r0, r1, c0, c1, inside in _triangles(uvs, faces, width, height):
        label[r0:r1, c0:c1][inside] = ids[n]
    counts = np.bincount(label[label >= 0], minlength=max(ids, default=-1) + 1)
    return {i: int(counts[i]) for i in sorted(set(ids))}


def shift_hsv(rgb, mask, hue_deg=0.0, sat=1.0, val=1.0, grey_sat=0.15):
    """Copy of rgb (uint8 HxWx3) with hue/saturation/value changed only where mask is True; every other pixel is byte-identical."""
    out = rgb.copy(); x = rgb[mask].astype(np.float32) / 255.0
    if not len(x): return out
    mx, mn = x.max(1), x.min(1); c = mx - mn; s = np.where(mx > 0, c / np.maximum(mx, 1e-6), 0)
    r, g, b = x[:, 0], x[:, 1], x[:, 2]; cc = np.maximum(c, 1e-6)
    h = np.where(mx == r, ((g - b) / cc) % 6, np.where(mx == g, (b - r) / cc + 2, (r - g) / cc + 4)) * 60.0
    h = (h + hue_deg * np.clip(s / grey_sat, 0, 1)) % 360.0          # near-grey pixels get little or no hue shift
    s2, v2 = np.clip(s * sat, 0, 1), np.clip(mx * val, 0, 1)
    k = lambda n: (n + h / 60.0) % 6
    f = lambda n: v2 - v2 * s2 * np.clip(np.minimum(k(n), 4 - k(n)), 0, 1)
    out[mask] = np.clip(np.stack([f(5), f(3), f(1)], 1) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('texture'); ap.add_argument('mesh'); ap.add_argument('--islands'); ap.add_argument('--list', action='store_true')
    ap.add_argument('--hue', type=float, default=0.0); ap.add_argument('--sat', type=float, default=1.0); ap.add_argument('--val', type=float, default=1.0)
    ap.add_argument('--grow', type=int, default=0); ap.add_argument('--out', default='recolour_out')
    a = ap.parse_args()
    img = Image.open(a.texture)
    if img.mode not in ('L', 'LA', 'P', 'RGB', 'RGBA'): sys.exit(f'recolour: texture mode {img.mode} (16-bit or float) would be flattened; convert it to 8-bit PNG first')
    full = np.array(img.convert('RGBA')); rgb, alpha = full[..., :3], full[..., 3]; h, w = rgb.shape[:2]
    uvs, faces, skipped = read_obj_uv(a.mesh); ids = island_ids(faces, len(uvs)); known = sorted(set(ids))
    if skipped: print(f'recolour: {skipped} face(s) without a full set of UVs were ignored', file=sys.stderr)
    if a.list:
        cnt = {i: ids.count(i) for i in known}; area = island_areas(uvs, faces, ids, w, h)
        for i in known: print(json.dumps({'island': i, 'faces': cnt[i], 'px': area[i]}))
        return 0
    picked = {int(i) for i in (a.islands or '').split(',') if i.strip() != ''}
    if not picked or not picked <= set(known): sys.exit(f'recolour: pick islands from {known} with --islands (got {sorted(picked)})')
    mask = island_mask(uvs, faces, picked, w, h, a.grow)
    if not mask.any(): sys.exit('recolour: the picked islands cover 0 pixels at this texture size; check the UVs or use a larger texture')
    after = shift_hsv(rgb, mask, a.hue, a.sat, a.val)
    os.makedirs(a.out, exist_ok=True)
    Image.fromarray(np.dstack([after, alpha]), 'RGBA').save(os.path.join(a.out, 'recoloured.png')); Image.fromarray((mask * 255).astype(np.uint8)).save(os.path.join(a.out, 'mask.png'))
    ys, xs = np.where(mask); m = 8; y0, y1, x0, x1 = max(ys.min() - m, 0), min(ys.max() + m + 1, h), max(xs.min() - m, 0), min(xs.max() + m + 1, w)
    ba = np.concatenate([rgb[y0:y1, x0:x1], np.full((y1 - y0, 4, 3), 255, np.uint8), after[y0:y1, x0:x1]], 1)
    Image.fromarray(ba).save(os.path.join(a.out, 'before_after.png'))
    diff = (after != rgb).any(2)
    rep = {'islands': sorted(picked), 'mask_px': int(mask.sum()), 'changed_inside_mask': int(diff[mask].sum()), 'changed_outside_mask': int(diff[~mask].sum()), 'skipped_faces': skipped}
    print(json.dumps(rep)); return 1 if rep['changed_outside_mask'] else 0


if __name__ == '__main__': sys.exit(main())
