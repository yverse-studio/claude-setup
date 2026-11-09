"""Submit or inspect a cxy-scene-final job on the local Flamenco Manager.

  python cxy_submit.py submit job.json      job.json = {"name": ..., "settings": {...}}  (settings = JOB_TYPE keys)
  python cxy_submit.py status <job-id>      job status + each task's status
Refuses to submit while <queue>/STOP exists. Paths are checked before the job is sent.
"""
import json
import os
import sys
import urllib.error
import urllib.request

MANAGER = os.environ.get('FLAMENCO_URL', 'http://127.0.0.1:8080')
QUEUE = os.environ.get('CXY_QUEUE', r'C:\Users\Claude\Documents\StudioLibrary\_queue')
PATH_KEYS = ('blendfile', 'cams_json', 'render_script')


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(MANAGER + path, data=data, method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raise SystemExit(f'Manager said {e.code}: {e.read().decode(errors="replace")}')


def problems(settings):
    bad = [f'{k} not found: {settings.get(k)}' for k in PATH_KEYS if not os.path.exists(settings.get(k, ''))]
    bad += [f'pre script not found: {p}' for p in settings.get('pre_scripts', '').split('|') if p and not os.path.exists(p)]
    return bad


def submit(spec_path):
    if os.path.exists(os.path.join(QUEUE, 'STOP')):
        raise SystemExit(f'STOP file set in {QUEUE}: not submitting')
    with open(spec_path, encoding='utf-8') as fh:
        spec = json.load(fh)
    bad = problems(spec['settings'])
    if bad:
        raise SystemExit('not submitting:\n  ' + '\n  '.join(bad))
    job = api('POST', '/api/v3/jobs', dict(name=spec['name'], type='cxy-scene-final', priority=spec.get('priority', 50),
                                          submitter_platform='windows', settings=spec['settings'], metadata={}))
    print(job['id'], job['status'])


def status(job_id):
    job = api('GET', f'/api/v3/jobs/{job_id}')
    tasks = api('GET', f'/api/v3/jobs/{job_id}/tasks')['tasks']
    print(job['name'], job['status'])
    for t in tasks:
        print(f"  {t['name']:<16} {t['status']}")


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('submit', 'status'):
        raise SystemExit(__doc__)
    (submit if sys.argv[1] == 'submit' else status)(sys.argv[2])
