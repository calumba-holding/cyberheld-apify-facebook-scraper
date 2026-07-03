#!/usr/bin/env bash
# Start watch-dev for workers 1–5 in parallel (one terminal).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

ARGS=("$@")

echo "Starting 5 workers in parallel."
echo "Stop: Ctrl+C (will stop all workers)"
echo ""
echo "noVNC URLs:"
for n in 1 2 3 4 5; do
  echo "  worker ${n}: http://127.0.0.1:608${n}/vnc.html?path=websockify&autoconnect=1&resize=scale"
done
echo ""

pids=()
cleanup() {
  echo ""
  echo "Stopping workers..."
  for pid in "${pids[@]:-}"; do
    kill "${pid}" 2>/dev/null || true
  done
  wait || true
}
trap cleanup INT TERM EXIT

for n in 1 2 3 4 5; do
  bash "./scripts/docker/watch-dev.sh" "${n}" "${ARGS[@]}" &
  pids+=("$!")
done

wait
