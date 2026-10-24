#!/usr/bin/env bash
# The only thing to paste into Project settings > Cloud environment > Setup script, once. It runs
# the current cloud/setup.sh from main, so the environment never drifts from this repo again
# (a pasted copy kept retired plugins and an old context guard). Main is gated (gate.md).
set -u
curl -fsSL --retry 3 https://raw.githubusercontent.com/yverse-studio/claude-setup/main/cloud/setup.sh | bash \
  || echo "claude-setup: could not fetch cloud/setup.sh from main"
