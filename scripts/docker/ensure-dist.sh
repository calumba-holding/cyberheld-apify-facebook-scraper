#!/usr/bin/env bash
# Build TypeScript so Docker uses current watch/poller code via dist mount.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"
npm run build
if ! grep -q 'runPostEngagementScrapeOnPage' dist/watch/poller.js; then
  echo "ERROR: dist/watch/poller.js missing watch fixes — build failed?" >&2
  exit 1
fi
echo "dist/ OK (watch poller includes runPostEngagementScrapeOnPage)"
