#!/usr/bin/env bash
# Keep noVNC open for testing — no Chrome login. Ctrl+C when done.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

WORKER_NUM="${1:-1}"
SERVICE="fb-worker-${WORKER_NUM}"
NOVNC_PORT="608${WORKER_NUM}"
VNC_PORT="590${WORKER_NUM}"

echo "Starting VNC test on http://127.0.0.1:${NOVNC_PORT}/vnc.html"
echo "Try the three URLs printed below. Ctrl+C in this terminal when finished."

exec docker compose run --rm \
  -p "${NOVNC_PORT}:6080" \
  -p "${VNC_PORT}:5900" \
  "${SERVICE}" vnc-hold
