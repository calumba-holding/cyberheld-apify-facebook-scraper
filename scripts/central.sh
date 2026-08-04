#!/usr/bin/env bash
# Central API demo — Pascal's architecture, live.
#
#   central API gateway (:8080)  ->  scraper's 1 api / bridge (:8000)  ->  docker worker
#   (fb-live, signed-in Chrome + noVNC on :6081)  scrapes and streams to noVNC.
#
# Usage:
#   scripts/central.sh run "<facebook-post-url>" [post|profile]   # spin up + fire through the central API
#   scripts/central.sh watch                                      # open noVNC + live request log
#   scripts/central.sh up | down | status
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER="fb-live"
IMAGE="facebook-scraper-fb-worker-1:latest"
BRIDGE_PORT="8000"
GW_PORT="8080"
GW="http://127.0.0.1:${GW_PORT}"
NOVNC="http://localhost:6081/vnc.html?path=websockify&autoconnect=1&resize=scale"
BRIDGE_LOG="/tmp/scraper-bridge.log"
GW_LOG="/tmp/central-gateway.log"

healthy() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$1/health" 2>/dev/null)" = "200" ]; }

up() {
  # 1) live worker: display + noVNC only; scrapes are exec'd into it
  if ! docker ps --format '{{.Names}}' | grep -qx "$WORKER"; then
    echo "• starting live worker ($WORKER) with noVNC…"
    docker rm -f "$WORKER" >/dev/null 2>&1 || true
    docker run --rm -v "$ROOT/docker/profiles/worker-1:/data/profiles" --entrypoint bash "$IMAGE" \
      -c 'rm -f /data/profiles/facebook/Singleton*' >/dev/null 2>&1 || true
    ( cd "$ROOT" && docker compose run -d --name "$WORKER" --service-ports fb-worker-1 vnc-hold >/dev/null )
  else
    echo "• live worker already up"
  fi

  # 2) scraper bridge (the scraper's 1 API)
  if ! healthy "$BRIDGE_PORT"; then
    echo "• starting scraper bridge (:$BRIDGE_PORT)…"
    WORKER_CONTAINER="$WORKER" PORT="$BRIDGE_PORT" nohup node "$ROOT/scripts/scraper-bridge.mjs" >"$BRIDGE_LOG" 2>&1 &
  else
    echo "• bridge already up"
  fi

  # 3) central API gateway -> bridge
  if ! healthy "$GW_PORT"; then
    echo "• starting central API gateway (:$GW_PORT)…"
    ( cd "$ROOT/central-api-router/src" && \
      SCRAPER_FACEBOOK_COMMENTS_URL="http://127.0.0.1:${BRIDGE_PORT}" \
      SCRAPER_FACEBOOK_WATCH_URL="http://127.0.0.1:${BRIDGE_PORT}" \
      nohup ../.venv/bin/uvicorn api_router.app:app --host 127.0.0.1 --port "$GW_PORT" --log-level warning >"$GW_LOG" 2>&1 & )
  else
    echo "• gateway already up"
  fi

  # wait for health
  for _ in $(seq 1 20); do healthy "$BRIDGE_PORT" && healthy "$GW_PORT" && break; sleep 1; done
  echo ""
  echo "  Central API : ${GW}   (POST /facebook/comments)"
  echo "  Watch live  : ${NOVNC}"
}

run() {
  local url="${1:?usage: central.sh run <facebook-post-url> [post|profile]}"
  local mode="${2:-post}"
  up
  local out_dir="$ROOT/runs/central"; mkdir -p "$out_dir"
  local out_file="${out_dir}/$(date +%Y%m%d-%H%M%S)-${mode}.json"
  echo ""
  echo "▶ firing through the central API  (${mode})  — watch it in noVNC…"
  curl -s -X POST "${GW}/facebook/comments" \
    -H 'content-type: application/json' \
    -d "{\"target_url\":\"${url}\",\"mode\":\"${mode}\"}" \
    -o "$out_file" -w 'HTTP %{http_code}  (%{time_total}s)\n'
  echo "✔ result saved: ${out_file}"
  python3 -m json.tool "$out_file" 2>/dev/null | head -40 || cat "$out_file"
}

watch() {
  echo "opening noVNC — watch Chrome scrape in real time:"
  echo "  $NOVNC"
  open "$NOVNC" 2>/dev/null || true
  echo ""
  echo "live request log (Ctrl+C to stop):"
  touch "$BRIDGE_LOG"
  tail -f "$BRIDGE_LOG"
}

status() {
  echo "worker : $(docker ps --format '{{.Names}} {{.Status}}' | grep "$WORKER" || echo 'down')"
  echo "bridge : $(healthy "$BRIDGE_PORT" && echo up || echo down)  (:$BRIDGE_PORT)"
  echo "gateway: $(healthy "$GW_PORT" && echo up || echo down)  (:$GW_PORT)"
}

down() {
  pkill -f 'scripts/scraper-bridge.mjs' 2>/dev/null || true
  lsof -ti "tcp:${GW_PORT}" 2>/dev/null | xargs kill 2>/dev/null || true
  docker rm -f "$WORKER" >/dev/null 2>&1 || true
  echo "central demo stopped."
}

case "${1:-help}" in
  up)     up ;;
  run)    shift; run "$@" ;;
  watch)  watch ;;
  status) status ;;
  down)   down ;;
  *) echo "usage: central.sh {run <url> [post|profile] | watch | up | status | down}" ;;
esac
