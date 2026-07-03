#!/usr/bin/env bash
# Raise Chrome windows on the virtual display (for noVNC observers).
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"
sleep 1

if command -v wmctrl >/dev/null 2>&1; then
  while IFS= read -r line; do
  id="${line%% *}"
  wmctrl -ia "${id}" 2>/dev/null || true
  wmctrl -ir "${id}" -b add,maximized_vert,maximized_horz 2>/dev/null || true
  done < <(wmctrl -lx 2>/dev/null | grep -iE 'chrome|chromium|facebook' || true)
fi

if command -v xdotool >/dev/null 2>&1; then
  xdotool search --onlyvisible --class "chrome" windowactivate 2>/dev/null || true
fi
