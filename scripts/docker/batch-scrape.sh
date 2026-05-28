#!/usr/bin/env bash
# Run up to 5 Facebook post URLs across 5 isolated Docker workers (one profile each).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
URLS_FILE="${1:-${ROOT_DIR}/docker/urls.txt}"

if [[ ! -f "${URLS_FILE}" ]]; then
  echo "URLs file not found: ${URLS_FILE}" >&2
  echo "Copy docker/urls.example.txt to docker/urls.txt and add one Facebook post URL per line." >&2
  exit 1
fi

mapfile -t URLS < <(grep -v '^\s*#' "${URLS_FILE}" | grep -v '^\s*$' || true)

if [[ "${#URLS[@]}" -eq 0 ]]; then
  echo "No URLs in ${URLS_FILE}" >&2
  exit 1
fi

if [[ "${#URLS[@]}" -gt 5 ]]; then
  echo "This batch runner supports at most 5 URLs (one per worker). Found ${#URLS[@]}." >&2
  exit 1
fi

cd "${ROOT_DIR}"

echo "Building worker image..."
docker compose build

PIDS=()
for i in "${!URLS[@]}"; do
  worker=$((i + 1))
  url="${URLS[$i]}"
  echo ""
  echo "=== worker-${worker} → ${url} ==="
  docker compose run --rm "fb-worker-${worker}" scrape "${url}" &
  PIDS+=("$!")
done

FAIL=0
for pid in "${PIDS[@]}"; do
  if ! wait "${pid}"; then
    FAIL=1
  fi
done

if [[ "${FAIL}" -ne 0 ]]; then
  echo "One or more workers failed. Check logs above and artifacts under docker/artifacts/." >&2
  exit 1
fi

echo ""
echo "Batch finished. Artifacts:"
find "${ROOT_DIR}/docker/artifacts" -type f 2>/dev/null | head -20 || true
