#!/usr/bin/env bash
# Create farm/config/worker-N.json from worker.example.json if missing.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

WORKER_NUM="${1:?worker number 1-5}"
if [[ ! "${WORKER_NUM}" =~ ^[1-5]$ ]]; then
  echo "Worker number must be 1–5" >&2
  exit 1
fi

OUT="farm/config/worker-${WORKER_NUM}.json"
if [[ -f "${OUT}" ]]; then
  echo "Already exists: ${OUT}"
  exit 0
fi

ACCOUNT_REF="$(printf 'cm-%03d' "${WORKER_NUM}")"
sed \
  -e "s/fb-worker-1/fb-worker-${WORKER_NUM}/g" \
  -e "s/cm-001/${ACCOUNT_REF}/g" \
  farm/config/worker.example.json > "${OUT}"

echo "Created ${OUT}"
echo "Edit posts[] with the Facebook URLs this CM should watch."
