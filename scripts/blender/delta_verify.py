"""Proof for base + delta (docs/base-delta.md). Plain Python + numpy, no Blender.
  python -I delta_verify.py <base.npz> <delta.json> <result.npz> [--live <live.npz>] [--ident CH_x] [--out report.json]
The .npz files come from `delta.py dump`. EXPECTED is computed here from the base dump and the delta (scale k, key values),
independent of the code path that built the result. Exit 1 on any failure.

Checks: every object scale 1; every base bone = base x k (0.01 mm) with the base roll; every base shape key identical to the base
(0.01 mm); identity key CH_x = basis x k at value 1; mesh co = Basis (the co-vs-Basis trap); weights of every base group identical;
key values from the delta. --live prints how far the old file was from the same expectation (what the rebuild changed)."""
import sys, json
import numpy as np

TOL_M = 1e-5


def load(p):
    z = np.load(p); return {k: z[k] for k in z.files}, json.load(open(p + '.json'))


def mm(a, b):
    return float(np.abs(a - b).max() * 1000) if a.size else 0.0


def weight_diff(bw, bnames, rw, rnames, tol=1e-5):
    """Base groups only (groups the character added stay untouched). Returns the names of groups whose weights differ."""
    bad = []
    for gi, name in enumerate(bnames):
        a = bw[bw[:, 1] == gi]
        if name not in rnames: bad.append(name); continue
        r = rw[rw[:, 1] == rnames.index(name)]
        a = a[np.argsort(a[:, 0], kind='stable')]; r = r[np.argsort(r[:, 0], kind='stable')]
        if len(a) != len(r) or (len(a) and (np.any(a[:, 0] != r[:, 0]) or np.abs(a[:, 2] - r[:, 2]).max() > tol)): bad.append(name)
    return bad


def check(base, bm, res, rm, delta, ident, label=''):
    k = delta['proportion']['scale']; fails = []; rows = {}

    def f(cond, msg):
        if not cond: fails.append(msg)
    f(all(tuple(v) == (1, 1, 1) for v in rm['scale'].values()), f'{label}object scale not 1: {[n for n, v in rm["scale"].items() if tuple(v) != (1, 1, 1)]}')
    bad = []
    for n, b in bm['bones'].items():
        r = rm['bones'].get(n)
        if not r: bad.append((n, 'missing')); continue
        d = max(np.abs(np.array(r['head']) - np.array(b['head']) * k).max(), np.abs(np.array(r['tail']) - np.array(b['tail']) * k).max())
        if d > TOL_M: bad.append((n, round(d * 1000, 3)))
        if abs(r['roll'] - b['roll']) > 1e-4: bad.append((n, 'roll'))
        if r['parent'] != b['parent']: bad.append((n, 'parent'))
    rows['bones_bad'] = bad[:12]; f(not bad, f'{label}{len(bad)} bones differ from base x k: {bad[:6]}')
    for role, n in bm['nverts'].items():
        if role not in rm['nverts']: fails.append(f'{label}{role} missing'); continue
        f(rm['nverts'][role] == n, f'{label}{role} verts {rm["nverts"][role]} != base {n}')
        if rm['nverts'][role] != n: continue
        basis = base[f'{role}|Basis'] if f'{role}|Basis' in base else None
        worst = (0.0, '')
        for key in [x for x in bm['values'].get(role, {})]:
            if key.startswith('CH_') or f'{role}|{key}' not in res: continue
            d = mm(res[f'{role}|{key}'], base[f'{role}|{key}'])
            if d > worst[0]: worst = (d, key)
        rows[f'{role}_keys_max_mm'] = [round(worst[0], 4), worst[1]]
        f(worst[0] <= TOL_M * 1000, f'{label}{role}: base key {worst[1]} differs {worst[0]:.4f} mm')
        if basis is not None:
            idk = f'{role}|{ident}'
            f(idk in res, f'{label}{role}: identity key {ident} missing')
            if idk in res:
                d = mm(res[idk], basis * k); rows[f'{role}_identity_mm'] = round(d, 4)
                f(d <= TOL_M * 1000, f'{label}{role}: {ident} != basis x k ({d:.4f} mm)')
                f(abs(rm['values'][role].get(ident, 0) - 1) < 1e-4, f'{label}{role}: {ident} value {rm["values"][role].get(ident)} != 1')
            d = mm(res[f'{role}|co'], res[f'{role}|Basis']); rows[f'{role}_co_vs_basis_mm'] = round(d, 4)
            f(d <= 1e-3, f'{label}{role}: vertex co differs from Basis {d:.4f} mm')
        bad = weight_diff(base[f'{role}|W'], bm['weights'][role], res[f'{role}|W'], rm['weights'][role])
        rows[f'{role}_weight_groups_bad'] = bad[:8]; f(not bad, f'{label}{role}: {len(bad)} weight groups differ: {bad[:5]}')
        for key, v in delta['keys'].get(role, {}).items():
            if key in rm['values'].get(role, {}) and abs(rm['values'][role][key] - v) > 1e-3: fails.append(f'{label}{role}: value {key} {rm["values"][role][key]} != {v}')
    return fails, rows


def compare_live(base, bm, live, lm, delta, ident):
    """How far the OLD file was from the expectation (informational: this is what the rebuild changed)."""
    k = delta['proportion']['scale']; out = {}
    for role, n in bm['nverts'].items():
        if lm['nverts'].get(role) != n: out[role] = f'own topology ({lm["nverts"].get(role)} vs {n} verts)'; continue
        exp = base[f'{role}|Basis'] * k
        live_eff = live[f'{role}|Basis'] + (live[f'{role}|{ident}'] - live[f'{role}|Basis'] if f'{role}|{ident}' in live else 0)
        d = np.abs(live_eff - exp).max(1) * 1000
        out[role] = dict(rest_max_mm=round(float(d.max()), 2), p99_mm=round(float(np.percentile(d, 99)), 2), over_0_5mm=int((d > 0.5).sum()))
    b = [n for n, v in bm['bones'].items() if n in lm['bones'] and max(np.abs(np.array(lm['bones'][n]['head']) - np.array(v['head']) * k).max(), np.abs(np.array(lm['bones'][n]['tail']) - np.array(v['tail']) * k).max()) > 1e-4]
    out['bones_off_mm_gt_0.1'] = b[:10]
    return out


if __name__ == '__main__':
    a = sys.argv[1:]
    base, bm = load(a[0]); delta = json.load(open(a[1])); res, rm = load(a[2])
    ident = a[a.index('--ident') + 1] if '--ident' in a else 'CH_' + delta['character']
    fails, rows = check(base, bm, res, rm, delta, ident)
    report = dict(character=delta['character'], scale=delta['proportion']['scale'], ok=not fails, fails=fails, rows=rows)
    if '--live' in a:
        live, lm = load(a[a.index('--live') + 1]); report['old_file_vs_expected'] = compare_live(base, bm, live, lm, delta, ident)
    if '--out' in a: json.dump(report, open(a[a.index('--out') + 1], 'w'), indent=1)
    print(json.dumps(report, indent=1)[:3500])
    sys.exit(1 if fails else 0)
