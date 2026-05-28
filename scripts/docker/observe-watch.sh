#!/usr/bin/env bash
# Watch with noVNC — mounts host dist/ so code changes apply without docker rebuild.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

WORKER_NUM="${1:-1}"
shift || true

SERVICE="fb-worker-${WORKER_NUM}"
CONFIG="farm/config/worker-${WORKER_NUM}.json"
NOVNC_PORT="608${WORKER_NUM}"
VNC_PORT="590${WORKER_NUM}"
NOVNC_URL="http://127.0.0.1:${NOVNC_PORT}/vnc.html?path=websockify&autoconnect=1&resize=scale"

if [[ ! -f "${CONFIG}" ]]; then
  echo "Missing ${CONFIG}" >&2
  exit 1
fi

echo "Building latest TypeScript into dist/ ..."
"${ROOT_DIR}/scripts/docker/ensure-dist.sh"
echo ""

quoted_watch_args=""
for arg in "$@"; do
  quoted_watch_args+=" $(printf '%q' "$arg")"
done

echo "=== Observe watch (noVNC first, then Chrome) ==="
echo "Using host dist/ mount — look for: Chrome is running on the virtual display"
echo ""

exec docker compose run --rm \
  -T \
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
export SCRAPE_ARTIFACT_ROOT_DIR=\"\${SCRAPE_ARTIFACT_ROOT_DIR:-/data/artifacts}\"
export SCRAPE_CHROME_EXECUTABLE=\"\${SCRAPE_CHROME_EXECUTABLE:-/usr/bin/google-chrome-stable}\"
export WATCH_CONFIG=\"\${WATCH_CONFIG:-/data/watch-config/worker.json}\"

/usr/local/bin/start-display.sh

echo ''
echo '╔══════════════════════════════════════════════════════════════╗'
echo '║  Open this URL in your Mac browser NOW:                      ║'
echo '╠══════════════════════════════════════════════════════════════╣'
echo '║  ${NOVNC_URL}'
echo '╚══════════════════════════════════════════════════════════════╝'
echo ''
echo 'Green xterm = connected. Press Enter HERE when you see the desktop.'
read -r

echo 'Starting watch (Chrome opens on noVNC)...'
exec /usr/local/bin/entrypoint.sh watch${quoted_watch_args}
"
