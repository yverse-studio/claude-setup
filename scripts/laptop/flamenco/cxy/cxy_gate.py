"""Gate task of cxy-scene-final: waits until the laptop's one Blender lane is free, then writes the WHO.md line.

Blocked while: <queue>/STOP exists, free RAM < --min-free-gb, or any blender.exe runs (the gate runs before
our own render, so every running Blender belongs to someone else). The lane must stay free for
--settle-checks polls in a row, so a gap between another thread's Blender runs does not open it. Prints a line every 60 s so Flamenco's
task timeout never fires; gives up (exit 2) after --max-wait-h hours. Exit 0 = lane free, WHO.md written.
"""
import argparse
import ctypes
import os
import subprocess
import sys
import time

POLL_S = 60


class MemStatus(ctypes.Structure):
    _fields_ = [('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong),
                ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong),
                ('ullTotalVirtual', ctypes.c_ulonglong), ('ullAvailVirtual', ctypes.c_ulonglong),
                ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]


def free_gb():
    m = MemStatus()
    m.dwLength = ctypes.sizeof(MemStatus)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
    return m.ullAvailPhys / 1024 ** 3


def blender_pids():
    out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq blender.exe', '/FO', 'CSV', '/NH'],
                         capture_output=True, text=True).stdout
    return [line.split('","')[1] for line in out.splitlines() if line.lower().startswith('"blender.exe"')]


def blocked(queue, min_free):
    why = []
    if os.path.exists(os.path.join(queue, 'STOP')):
        why.append('STOP file set')
    gb = free_gb()
    if gb < min_free:
        why.append(f'free RAM {gb:.1f} GB < {min_free} GB')
    pids = blender_pids()
    if pids:
        why.append(f'other blender.exe running (pid {",".join(pids)})')
    return why, gb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--queue', required=True)
    ap.add_argument('--job', required=True)
    ap.add_argument('--thread', default='flamenco')
    ap.add_argument('--min-free-gb', type=float, default=4.0)
    ap.add_argument('--max-wait-h', type=float, default=12.0)
    ap.add_argument('--settle-checks', type=int, default=3, help='lane must be free this many polls in a row (gaps between other Blender runs)')
    a = ap.parse_args()
    t0, free_in_row = time.time(), 0
    while True:
        why, gb = blocked(a.queue, a.min_free_gb)
        free_in_row = 0 if why else free_in_row + 1
        if free_in_row >= a.settle_checks:
            break
        if not why:
            print(f'GATE SETTLE {free_in_row}/{a.settle_checks}: lane free, checking again', flush=True)
            time.sleep(POLL_S)
            continue
        if time.time() - t0 > a.max_wait_h * 3600:
            print(f'GATE GAVE UP after {a.max_wait_h} h: {"; ".join(why)}', flush=True)
            sys.exit(2)
        print(f'GATE WAIT {time.strftime("%H:%M")}: {"; ".join(why)}', flush=True)
        time.sleep(POLL_S)
    line = (f'{time.strftime("%Y-%m-%d %H:%M")} | {a.thread} | Flamenco worker (one Blender -b) | '
            f'job {a.job} (cxy-scene-final) | free RAM {gb:.1f} GB at start\n')
    print('GATE OPEN', line.strip(), flush=True)  # print first: a print error must not leave a WHO.md claim behind
    with open(os.path.join(a.queue, 'WHO.md'), 'a', encoding='utf-8') as fh:
        fh.write(line)


if __name__ == '__main__':
    main()
