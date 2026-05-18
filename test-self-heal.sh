#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${SCRAPE_LLM_API_KEY:-}" ]]; then
  echo "SCRAPE_LLM_API_KEY is not set. Add it to .env or export it before running." >&2
  exit 1
fi

node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url "${SCRAPE_SELF_HEAL_TARGET_URL:-https://www.facebook.com/share/p/1Ahqyuv1ky/}" \
  --public-session \
  --no-screen-video \
  --verbose 2>&1 | grep -iE "script|gemini|llm|warn|error|saved"
