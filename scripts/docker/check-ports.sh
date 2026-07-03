#!/usr/bin/env bash
# Quick check: is noVNC reachable on this machine?
set -euo pipefail

WORKER_NUM="${1:-1}"
NOVNC_PORT="608${WORKER_NUM}"

echo "Checking localhost:${NOVNC_PORT} ..."

if lsof -i ":${NOVNC_PORT}" -sTCP:LISTEN 2>/dev/null | head -5; then
  echo "OK: something is listening on ${NOVNC_PORT}."
  echo "Try: http://localhost:${NOVNC_PORT}/vnc.html"
else
  echo "NOT LISTENING: no process on port ${NOVNC_PORT}."
  echo ""
  echo "Start a container first, e.g.:"
  echo "  ./scripts/docker/login-visible.sh ${WORKER_NUM}"
  echo "  ./scripts/docker/watch-visible.sh ${WORKER_NUM} --once"
  echo ""
  echo "noVNC only works while that command is still running in the terminal."
fi
