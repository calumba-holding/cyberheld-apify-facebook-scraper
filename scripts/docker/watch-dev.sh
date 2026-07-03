#!/usr/bin/env bash
# Always-on (or --once) watch with host dist/ mount + noVNC — no Enter prompt.
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
  echo "Missing ${CONFIG} — run: ./scripts/docker/setup-worker-config.sh ${WORKER_NUM}" >&2
  exit 1
fi

"${ROOT_DIR}/scripts/docker/ensure-dist.sh"

quoted_watch_args=""
for arg in "$@"; do
  quoted_watch_args+=" $(printf '%q' "$arg")"
done

echo "Worker ${WORKER_NUM} watch (dist mount, comments-only by default in config)"
echo "noVNC: ${NOVNC_URL}"
echo "Artifacts: docker/artifacts/worker-${WORKER_NUM}/watch/"
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
/usr/local/bin/start-display.sh
echo 'noVNC: ${NOVNC_URL}'
exec /usr/local/bin/entrypoint.sh watch${quoted_watch_args}
"
