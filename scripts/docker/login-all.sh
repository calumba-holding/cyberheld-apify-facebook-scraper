#!/usr/bin/env bash
# Start noVNC login sessions for all five workers (run in separate terminals or background).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

docker compose build

echo "Open these URLs in your browser and log into a *different* Facebook account in each:"
for port in 6081 6082 6083 6084 6085; do
  echo "  http://localhost:${port}/vnc.html"
done
echo ""
echo "Starting login sessions (Ctrl+C stops the worker you interrupt)..."

for worker in 1 2 3 4 5; do
  echo ""
  echo ">>> fb-worker-${worker} — noVNC http://localhost:608${worker}/vnc.html"
  docker compose run --rm --service-ports "fb-worker-${worker}" login
done
