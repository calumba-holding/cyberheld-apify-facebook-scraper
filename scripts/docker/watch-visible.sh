#!/usr/bin/env bash
# Run watch with noVNC on http://localhost:608N/vnc.html (only while this process runs)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

WORKER_NUM="${1:-1}"
shift || true

SERVICE="fb-worker-${WORKER_NUM}"
CONFIG="farm/config/worker-${WORKER_NUM}.json"
NOVNC_PORT="608${WORKER_NUM}"
VNC_PORT="590${WORKER_NUM}"

if [[ ! -f "${CONFIG}" ]]; then
  echo "Missing ${CONFIG} — copy from farm/config/worker.example.json" >&2
  exit 1
fi

echo "Open (auto-connect): http://localhost:${NOVNC_PORT}/vnc.html?autoconnect=1&resize=scale&reconnect=1"
echo "Manual Connect form: Port = ${NOVNC_PORT}, not 5900."
echo "Starting ${SERVICE} watch $*"

exec docker compose run --rm \
  -T \
  -p "${NOVNC_PORT}:6080" \
  -p "${VNC_PORT}:5900" \
  "${SERVICE}" watch "$@"
