#!/usr/bin/env bash
# Paste this into Project settings > Cloud environment > Setup script, once. It runs the current
# cloud/setup.sh from main, so the environment never drifts from this repo (a pasted copy kept
# retired plugins and an old context guard). Main is gated (gate.md).
# Caveat (tested 2026-10-26, code.claude.com cloud-environments, Environment caching): the script runs only when
# the environment cache is built. The cache is rebuilt when the pasted Setup script text changes, when the allowed
# network hosts change, or after about 7 days. A change to cloud/setup.sh on main therefore reaches new sessions only
# at the next rebuild. To force one, edit the pasted text (add or bump a line `# rebuild: <date>`) and save.
set -u
f="$(mktemp)" && curl -fsSL --retry 3 -o "$f" https://raw.githubusercontent.com/yverse-studio/claude-setup/main/cloud/setup.sh \
  && bash "$f" || echo "claude-setup: could not fetch or run cloud/setup.sh from main"
