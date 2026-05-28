#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"
NOVNC_PORT="${NOVNC_PORT:-6080}"
VNC_PORT="${VNC_PORT:-5900}"

log() { echo "[start-display] $*" >&2; }

wait_for_tcp() {
  local port="$1"
  local label="$2"
  local tries="${3:-50}"
  for ((i = 1; i <= tries; i++)); do
    if (echo >/dev/tcp/127.0.0.1/"${port}") 2>/dev/null; then
      log "${label} listening on ${port}"
      return 0
    fi
    sleep 0.2
  done
  log "ERROR: ${label} did not start on port ${port}"
  return 1
}

if ! pgrep -f "Xvfb ${DISPLAY}" >/dev/null 2>&1; then
  log "Starting Xvfb on ${DISPLAY}"
  Xvfb "${DISPLAY}" -screen 0 1366x768x24 -ac +extension GLX +render -noreset &
fi

if command -v xdpyinfo >/dev/null 2>&1; then
  for ((i = 1; i <= 50; i++)); do
    if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
      log "X display ${DISPLAY} ready"
      break
    fi
    sleep 0.2
  done
else
  sleep 2
fi

if ! pgrep -x fluxbox >/dev/null 2>&1; then
  log "Starting fluxbox"
  mkdir -p /root/.fluxbox
  if [[ ! -f /root/.fluxbox/init ]]; then
    cp /usr/local/bin/fluxbox-init /root/.fluxbox/init 2>/dev/null || true
  fi
  DISPLAY="${DISPLAY}" fluxbox >/tmp/fluxbox.log 2>&1 &
  sleep 0.5
fi

if command -v xterm >/dev/null 2>&1 && ! pgrep -x xterm >/dev/null 2>&1; then
  log "Starting hint terminal (you should see this in noVNC)"
  DISPLAY="${DISPLAY}" xterm -geometry 80x6+20+20 -fa 'Monospace-12' -fb 'Monospace-12-bold' \
    -bg '#222' -fg '#0f0' -title 'Scraper display' \
    -e 'echo "noVNC is connected."; echo "Chrome will open here when watch/login starts."; echo "Keep this window visible."; sleep 3600' \
    >/tmp/xterm.log 2>&1 &
fi

if ! pgrep -x x11vnc >/dev/null 2>&1; then
  log "Starting x11vnc on port ${VNC_PORT}"
  x11vnc -display "${DISPLAY}" -forever -shared -nopw -localhost \
    -noxdamage -rfbport "${VNC_PORT}" >/tmp/x11vnc.log 2>&1 &
fi
wait_for_tcp "${VNC_PORT}" "x11vnc" || {
  tail -20 /tmp/x11vnc.log >&2 || true
  exit 1
}

if ! pgrep -f "websockify.*${NOVNC_PORT}" >/dev/null 2>&1; then
  log "Starting websockify on port ${NOVNC_PORT} -> localhost:${VNC_PORT}"
  websockify --web=/usr/share/novnc/ "${NOVNC_PORT}" "127.0.0.1:${VNC_PORT}" \
    >/tmp/websockify.log 2>&1 &
fi
wait_for_tcp "${NOVNC_PORT}" "websockify" || {
  tail -20 /tmp/websockify.log >&2 || true
  exit 1
}

log "Display stack ready (noVNC inside container: http://127.0.0.1:${NOVNC_PORT}/vnc.html)"
