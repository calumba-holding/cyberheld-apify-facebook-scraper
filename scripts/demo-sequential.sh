#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8080}"
TARGET_URL="${1:-https://www.facebook.com/strache/posts/pfbid02W8viejbotoUbitpaHq5VZECCHGVGZfe4DbmXEETEYhjkMWu3N1d8oaMEB316aatXl}"
OUTPUT_DIR="${OUTPUT_DIR:-runs/demo}"
WORKERS="${WORKERS:-1 2 3}"

mkdir -p "$OUTPUT_DIR"

wait_for_job() {
  local job_id="$1"
  while true; do
    local job_state
    job_state="$(curl -fsS "$API_URL/v1/jobs/$job_id")"
    local job_status
    job_status="$(printf '%s' "$job_state" | jq -r '.status')"
    printf 'job %s: %s\n' "$job_id" "$job_status"
    case "$job_status" in
      succeeded|partial)
        curl -fsS "$API_URL/v1/jobs/$job_id/result/download" \
          --output "$OUTPUT_DIR/$job_id-result.json"
        printf 'saved: %s/%s-result.json\n' "$OUTPUT_DIR" "$job_id"
        return 0
        ;;
      failed|cancelled)
        printf '%s\n' "$job_state" | jq '{job_id,status,error}' >&2
        return 1
        ;;
      needs_authentication)
        printf '%s\n' "$job_state" | jq '{status,login_url,next_actions}'
        printf 'Authenticate and resume this job, then press Enter to continue waiting.\n'
        read -r
        ;;
      *)
        sleep 5
        ;;
    esac
  done
}

for worker in $WORKERS; do
  printf '\nStarting worker %s...\n' "$worker"
  response="$(curl -fsS -X POST "$API_URL/v1/jobs" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n \
      --arg target_url "$TARGET_URL" \
      --argjson worker "$worker" \
      '{target_url: $target_url, scraper: "post-engagement", worker: $worker, continue_watching: false}')")"
  printf '%s\n' "$response" | jq '{job_id,worker,status,login_url,next_actions}'
  job_id="$(printf '%s' "$response" | jq -r '.job_id')"
  wait_for_job "$job_id"
done

printf '\nDemo run complete. Results: %s\n' "$OUTPUT_DIR"
