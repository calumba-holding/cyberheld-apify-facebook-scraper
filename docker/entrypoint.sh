#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"
export SCRAPE_PROFILE_ROOT_DIR="${SCRAPE_PROFILE_ROOT_DIR:-/data/profiles}"
export SCRAPE_CHROME_EXECUTABLE="${SCRAPE_CHROME_EXECUTABLE:-/usr/bin/google-chrome-stable}"
export SCRAPE_ARTIFACT_ROOT_DIR="${SCRAPE_ARTIFACT_ROOT_DIR:-/data/artifacts}"

mkdir -p "${SCRAPE_PROFILE_ROOT_DIR}" "${SCRAPE_ARTIFACT_ROOT_DIR}"

random_jitter_ms() {
  local max_ms="${1:-15000}"
  echo $((RANDOM % max_ms))
}

usage() {
  cat <<'EOF'
Facebook scraper worker container

Commands:
  login              Open Facebook in a persistent profile (use noVNC to sign in manually)
  scrape <url>       Scrape one post URL with the saved profile (post-screenshot by default)
  profile <url>      Scrape a profile + latest posts (SCRAPE_MAX_POSTS, default 20)
  watch [--once]         Comment watch (starts Chrome immediately)
  observe-watch [--once] Wait for you to open noVNC, then watch (see the post live)
  observe-login          Wait for noVNC, then Facebook login
  vnc-doctor           Check Xvfb / x11vnc / websockify (publish -p 6081:6080 to test from Mac)
  vnc-hold             Display + noVNC only (green xterm test — no Chrome)
  shell              Bash shell with display stack running
  help               Show this message

Environment:
  SCRAPE_SCRAPER              post-screenshot | post-engagement (default: post-screenshot)
  SCRAPE_PROFILE_ROOT_DIR     Chrome profile root (default: /data/profiles)
  SCRAPE_WAIT_AFTER_NAVIGATION_MS
  WORKER_STAGGER_MAX_MS       Random delay before scrape (default: 20000)
  WATCH_CONFIG                Watch JSON path (default: /data/watch-config/worker.json)
  NOVNC_PORT / VNC_PORT

Profile path inside the volume:
  ${SCRAPE_PROFILE_ROOT_DIR}/facebook
EOF
}

start_display() {
  /usr/local/bin/start-display.sh
}

novnc_host_port() {
  local host_port="6081"
  if [[ -n "${NOVNC_PUBLIC_URL:-}" ]]; then
    host_port="$(echo "${NOVNC_PUBLIC_URL}" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')"
    host_port="${host_port:-6081}"
  fi
  echo "${host_port}"
}

novnc_observe_url() {
  local host_port
  host_port="$(novnc_host_port)"
  echo "http://127.0.0.1:${host_port}/vnc.html?path=websockify&autoconnect=1&resize=scale"
}

print_novnc_observe_banner() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  WATCH IN noVNC (only while this command runs)                 ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  $(novnc_observe_url)"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
}

wait_for_vnc_ready() {
  print_novnc_observe_banner
  echo "1. Open the URL above in Chrome on your Mac."
  echo "2. You should see a green terminal message, then Chrome will open."
  echo "3. Come back here and press Enter ONLY when noVNC shows the desktop."
  echo ""
  read -r -p "Press Enter when noVNC is connected... "
  echo "Starting Chrome / watch..."
}

run_vnc_hold() {
  start_display
  print_novnc_observe_banner
  echo "VNC test mode — you should see a green xterm window."
  echo "Ctrl+C here when done."
  trap 'echo "Stopping VNC test."; exit 0' INT TERM
  while true; do sleep 3600; done
}

run_vnc_doctor() {
  start_display
  echo "Processes:"
  pgrep -a Xvfb || echo "  Xvfb: missing"
  pgrep -a x11vnc || echo "  x11vnc: missing"
  pgrep -a websockify || echo "  websockify: missing"
  echo ""
  echo "Logs (last 15 lines):"
  echo "--- x11vnc ---"
  tail -15 /tmp/x11vnc.log 2>/dev/null || echo "(none)"
  echo "--- websockify ---"
  tail -15 /tmp/websockify.log 2>/dev/null || echo "(none)"
  echo ""
  curl -fsS -o /dev/null -w "HTTP vnc.html: %{http_code}\n" "http://127.0.0.1:${NOVNC_PORT:-6080}/vnc.html" || true
}

run_observe_login() {
  start_display
  wait_for_vnc_ready
  echo "Profile directory: ${SCRAPE_PROFILE_ROOT_DIR}/facebook"
  echo "Log into Facebook in the noVNC window, then press Enter here."
  exec node /app/dist/main.js profile login --target facebook \
    --chrome-executable "${SCRAPE_CHROME_EXECUTABLE}" \
    --profile-root-dir "${SCRAPE_PROFILE_ROOT_DIR}"
}

run_login() {
  start_display
  print_novnc_observe_banner
  echo "Profile directory: ${SCRAPE_PROFILE_ROOT_DIR}/facebook"
  echo "Tip: use observe-login to connect noVNC before Chrome starts."
  echo "Log into Facebook in the browser window, then press Enter in this terminal when finished."
  exec node /app/dist/main.js profile login --target facebook \
    --chrome-executable "${SCRAPE_CHROME_EXECUTABLE}" \
    --profile-root-dir "${SCRAPE_PROFILE_ROOT_DIR}"
}

run_observe_watch() {
  start_display
  wait_for_vnc_ready
  run_watch "$@"
}

run_watch() {
  local config="${WATCH_CONFIG:-/data/watch-config/worker.json}"
  local once_args=()
  if [[ "${1:-}" == "--once" ]]; then
    once_args=(--once)
  fi
  if [[ ! -f "${config}" ]]; then
    echo "Watch config not found: ${config}" >&2
    echo "Copy farm/config/worker.example.json to farm/config/worker-N.json and mount it." >&2
    exit 1
  fi
  exec node /app/dist/main.js watch \
    --config "${config}" \
    --chrome-executable "${SCRAPE_CHROME_EXECUTABLE}" \
    --profile-root-dir "${SCRAPE_PROFILE_ROOT_DIR}" \
    --artifact-root-dir "${SCRAPE_ARTIFACT_ROOT_DIR}" \
    "${once_args[@]}"
}

run_scrape() {
  local url="${1:?scrape requires a Facebook post URL}"
  local scraper="${SCRAPE_SCRAPER:-post-screenshot}"
  start_display
  local jitter
  jitter="$(random_jitter_ms "${WORKER_STAGGER_MAX_MS:-20000}")"
  echo "Staggering scrape start by ${jitter}ms to avoid synchronized bursts..."
  sleep "$(awk "BEGIN { printf \"%.3f\", ${jitter}/1000 }")"
  exec node /app/dist/main.js \
    --target facebook \
    --scraper "${scraper}" \
    --target-url "${url}" \
    --concurrency 1 \
    --chrome-executable "${SCRAPE_CHROME_EXECUTABLE}" \
    --profile-root-dir "${SCRAPE_PROFILE_ROOT_DIR}" \
    --artifact-root-dir "${SCRAPE_ARTIFACT_ROOT_DIR}"
}

run_profile() {
  local url="${1:?profile requires a Facebook profile URL}"
  start_display
  exec node /app/dist/facebook/scrapers/profile/run.js "${url}"
}

cmd="${1:-help}"
shift || true

case "${cmd}" in
  login)
    run_login
    ;;
  scrape)
    run_scrape "$@"
    ;;
  profile)
    run_profile "$@"
    ;;
  watch)
    if [[ -z "${SCRAPE_DISPLAY_STARTED:-}" ]]; then
      start_display
    fi
    print_novnc_observe_banner
    run_watch "$@"
    ;;
  observe-watch)
    run_observe_watch "$@"
    ;;
  observe-login)
    run_observe_login
    ;;
  vnc-doctor)
    run_vnc_doctor
    ;;
  vnc-hold)
    run_vnc_hold
    ;;
  shell)
    start_display
    exec bash
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown command: ${cmd}" >&2
    usage >&2
    exit 1
    ;;
esac
