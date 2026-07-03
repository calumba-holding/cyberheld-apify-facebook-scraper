#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

WORKER_NUM="${1:-1}"
SERVICE="fb-worker-${WORKER_NUM}"
NOVNC_PORT="608${WORKER_NUM}"
VNC_PORT="590${WORKER_NUM}"
NOVNC_URL="http://127.0.0.1:${NOVNC_PORT}/vnc.html?path=websockify&autoconnect=1&resize=scale"

"${ROOT_DIR}/scripts/docker/ensure-dist.sh"

exec docker compose run --rm \
  -p "${NOVNC_PORT}:6080" \
  -p "${VNC_PORT}:5900" \
  -e SCRAPE_DISPLAY_STARTED=1 \
  -v "${ROOT_DIR}/dist:/app/dist:ro" \
  --entrypoint bash \
  "${SERVICE}" \
  -c "
set -euo pipefail
export DISPLAY=\"\${DISPLAY:-:99}\"
export SCRAPE_PROFILE_ROOT_DIR=\"\${SCRAPE_PROFILE_ROOT_DIR:-/data/profiles}\"
export SCRAPE_CHROME_EXECUTABLE=\"\${SCRAPE_CHROME_EXECUTABLE:-/usr/bin/google-chrome-stable}\"

/usr/local/bin/start-display.sh

echo ''
echo 'Open: ${NOVNC_URL}'
echo 'Press Enter when noVNC shows the desktop...'
read -r

exec /usr/local/bin/entrypoint.sh login
"
