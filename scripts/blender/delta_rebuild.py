"""Rebuild characters from the CURRENT base and prove it (docs/base-delta.md). Plain Python, calls Blender.
  python delta_rebuild.py <char> [<char> ...] [--base <base.blend>] [--out <dir>] [--dress] [--extract] [--marker]

Per character: copy of the live file -> delta.py sync (rig, shape keys, weights, identity key) -> optional dress.py all
(re-fits every outfit, keeps looks) -> delta.py dump -> delta_verify.py. Live files are never written; results go to --out.
--extract  also reads the delta back from the rebuilt file; it must equal the stored delta (proportion, key values).
--marker   proof run: makes a test base with a +1 mm vertex and a +1 mm bone, rebuilds every character from it, and checks the
           marker arrived in each one (body Basis vertex 5000, identity key, bone Head tail x k).
Env: STUDIO_ROOT (required; library = lib/, tools = tools/laptop, see config/paths.json), BLENDER (exe, default: the path in tools/BLENDER_EXE.txt)."""
import os, sys, json, subprocess, shutil
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import paths  # STUDIO_ROOT + config/paths.json

LIB = paths.path('lib')
BLENDER = os.environ.get('BLENDER') or paths.blender_exe()
HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = paths.path('tools_laptop')
A = sys.argv[1:]


def opt(name, default=None):
    return A[A.index(name) + 1] if name in A else default


def free_gb():
    import ctypes
    class M(ctypes.Structure):
        _fields_ = [('l', ctypes.c_ulong), ('load', ctypes.c_ulong), ('tp', ctypes.c_ulonglong), ('ap', ctypes.c_ulonglong), ('tv', ctypes.c_ulonglong),
                    ('av', ctypes.c_ulonglong), ('tx', ctypes.c_ulonglong), ('ax', ctypes.c_ulonglong), ('ae', ctypes.c_ulonglong)]
    m = M(); m.l = ctypes.sizeof(M); ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)); return m.ap / 2**30


def wait_for_room(min_gb=4.0, limit_s=3600):
    """Laptop rule: start a Blender process only with enough free RAM (the animator's open Blenders count: they use RAM)."""
    import time
    t0 = time.time()
    while free_gb() < min_gb:
        if time.time() - t0 > limit_s: raise SystemExit(f'no room for Blender: {free_gb():.1f} GB free after {limit_s} s')
        print(f'waiting for RAM: {free_gb():.1f} GB free, need {min_gb}', flush=True); time.sleep(30)


def blender(blend, script, *args, timeout=1800):
    wait_for_room()
    cmd = [BLENDER, '-b', blend, '--factory-startup', '-P', script, '--'] + list(args)
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    keep = [l for l in p.stdout.splitlines() if l.startswith(('SYNC', 'DUMP', 'EXTRACT', 'MARKER', 'DRESSED', 'SAVED')) or 'Traceback' in l or 'Error' in l]
    if p.returncode or 'Traceback' in p.stdout: raise SystemExit(f'BLENDER FAILED {script} {blend}\n' + p.stdout[-2500:] + p.stderr[-800:])
    return keep


def character_file(char):
    c = json.load(open(os.path.join(TOOLS, 'clothes_items.json'), encoding='utf-8'))['characters'][char]
    return os.path.join(LIB, c['file'])


def main():
    chars = [a for a in A if not a.startswith('--') and a not in (opt('--base'), opt('--out'))]
    base = opt('--base', os.path.join(LIB, 'characters', 'CH_Base', 'female', 'Blend', 'base_female_v4.blend'))
    out = opt('--out', os.path.join(LIB, 'characters', 'CH_Base', 'female', '_work', 'delta', 'out'))
    os.makedirs(out, exist_ok=True)
    delta_py, verify_py = os.path.join(TOOLS, 'delta.py'), os.path.join(TOOLS, 'delta_verify.py')
    orig_base = base
    if '--marker' in A:
        mk = os.path.join(out, 'base_marker.blend'); print(blender(base, delta_py, 'marker', mk)); base = mk
    bdump = os.path.join(out, 'base.dump.npz'); blender(base, delta_py, 'dump', bdump)
    ok_all = True
    for c in chars:
        live = character_file(c); delta = os.path.join(out, f'{c}.delta.json'); sync = os.path.join(out, f'{c}.rebuilt.blend')
        if not os.path.exists(delta) or '--extract-fresh' in A:
            blender(live, delta_py, 'extract', c, delta, f'base={orig_base}')
        print(c, blender(live, delta_py, 'sync', c, delta, sync, f'base={base}')[-1][:300])
        if '--dress' in A:
            dressed = os.path.join(out, f'{c}.dressed.blend'); blender(sync, os.path.join(TOOLS, 'dress.py'), c, 'all', f'saveas={dressed}', timeout=3600)
            shutil.move(dressed, sync)
        dump = os.path.join(out, f'{c}.rebuilt.npz'); blender(sync, delta_py, 'dump', dump)
        livedump = os.path.join(out, f'{c}.live.npz')
        if not os.path.exists(livedump): blender(live, delta_py, 'dump', livedump)
        rep = os.path.join(out, f'{c}.verify.json')
        r = subprocess.run([sys.executable, '-I', verify_py, bdump, delta, dump, '--live', livedump, '--out', rep], capture_output=True, text=True)
        ok = r.returncode == 0; ok_all &= ok
        print(c, 'VERIFY', 'OK' if ok else 'FAIL', json.load(open(rep))['fails'][:5])
        if '--extract' in A:
            again = os.path.join(out, f'{c}.delta.rebuilt.json'); blender(sync, delta_py, 'extract', c, again, f'base={base}')
            d0, d1 = json.load(open(delta)), json.load(open(again))
            same = d0['proportion']['scale'] == d1['proportion']['scale'] and all(d0['keys'].get(r, {}) == d1['keys'].get(r, {}) for r in d0['keys']) and all(d0['own_keys'][r] == d1['own_keys'].get(r) for r in d0['own_keys'])
            print(c, 'DELTA read back from rebuilt file (scale, key values, own keys):', 'IDENTICAL' if same else 'DIFFERENT', '| drift now', {k: v.get('over', '-') for k, v in d1['drift'].items()})
            ok_all &= same
        if '--marker' in A:
            o, m = np.load(os.path.join(out, f'{c}.rebuilt.npz')), None
            k = json.load(open(delta))['proportion']['scale']
            ob = np.load(os.path.join(out, 'base.orig.npz')) if os.path.exists(os.path.join(out, 'base.orig.npz')) else None
            if ob is None: blender(orig_base, delta_py, 'dump', os.path.join(out, 'base.orig.npz')); ob = np.load(os.path.join(out, 'base.orig.npz'))
            dx = float((o['body|Basis'][5000] - ob['body|Basis'][5000])[0] * 1000)
            idk = f"body|{json.load(open(delta))['character'] and 'CH_' + c}"
            dk = float((o[idk][5000] - ob['body|Basis'][5000] * k)[0] * 1000)
            hb, hm = json.load(open(os.path.join(out, f'{c}.rebuilt.npz.json')))['bones']['Head'], json.load(open(os.path.join(out, 'base.orig.npz.json')))['bones']['Head']
            dh = (hb['tail'][0] - hm['tail'][0] * k) * 1000
            print(c, f'MARKER arrived: body vertex +{dx:.3f} mm in Basis, identity key {dk:.3f} mm (expect {k:.3f}), Head tail {dh:.3f} mm (expect {k:.3f})')
            ok_all &= abs(dx - 1) < 0.01 and abs(dk - k) < 0.01 and abs(dh - k) < 0.01
    print('ALL OK' if ok_all else 'SOMETHING FAILED')
    sys.exit(0 if ok_all else 1)


if __name__ == '__main__':
    main()
