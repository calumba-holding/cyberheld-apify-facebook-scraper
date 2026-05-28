#!/usr/bin/env bash
# Login with noVNC published to localhost:608N
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

WORKER_NUM="${1:-1}"
SERVICE="fb-worker-${WORKER_NUM}"
NOVNC_PORT="608${WORKER_NUM}"
VNC_PORT="590${WORKER_NUM}"

echo "Open this URL (auto-connect):"
echo "  http://localhost:${NOVNC_PORT}/vnc.html?autoconnect=1&resize=scale&reconnect=1"
echo "If you use the Connect form: leave Host empty, Port = ${NOVNC_PORT} (not 5900)."
echo "After Facebook login, press Enter in this terminal."

exec docker compose run --rm \
  -p "${NOVNC_PORT}:6080" \
  -p "${VNC_PORT}:5900" \
  "${SERVICE}" login
