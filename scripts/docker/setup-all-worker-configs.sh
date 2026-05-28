#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"
for n in 1 2 3 4 5; do
  bash scripts/docker/setup-worker-config.sh "${n}"
done
