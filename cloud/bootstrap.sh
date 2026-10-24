#!/usr/bin/env bash
# Paste this into Project settings > Cloud environment > Setup script, once. It runs the current
# cloud/setup.sh from main, so the environment never drifts from this repo (a pasted copy kept
# retired plugins and an old context guard). Main is gated (gate.md).
set -u
f="$(mktemp)" && curl -fsSL --retry 3 -o "$f" https://raw.githubusercontent.com/yverse-studio/claude-setup/main/cloud/setup.sh \
  && bash "$f" || echo "claude-setup: could not fetch or run cloud/setup.sh from main"
