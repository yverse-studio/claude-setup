"""Blender --python step 1 of cxy-scene-final: sets env vars (env=K=V|K2=V2 after '--') before the pre scripts read them."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cxy_common import parse_env, parse_opts  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
env = parse_env(parse_opts(args[5:]).get('env', ''))
os.environ.update(env)
print('CXY_ENV', env, flush=True)
