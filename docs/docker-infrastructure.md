# Docker infrastructure — isolated Facebook profiles

This is **step 1** of the multi-profile setup: five Docker workers, five persistent Chrome profile volumes, manual login over noVNC, then scrape five post URLs in parallel without sharing cookies or sessions.

## What you get

| Piece | Purpose |
|--------|---------|
| `docker-compose.yml` | Five services `fb-worker-1` … `fb-worker-5` |
| Volume `docker/profiles/worker-N` | Cookies and Chrome state for account N |
| noVNC `http://localhost:608N/vnc.html` | Manual Facebook login inside the container |
| `scripts/docker/batch-scrape.sh` | Reads `docker/urls.txt` and runs one URL per worker |

Each container is a **sandbox**: its own filesystem profile, display, and network namespace. The existing `scrape` CLI runs inside with `launchPersistentChromeContext`, same as on macOS, but with Linux Chrome and `/data/profiles/facebook` on a bind mount.

## Why this helps with bans

Facebook correlates **sessions**, not just IP addresses. Good practices for this stack:

1. **One real account per worker volume** — never reuse the same profile for two accounts.
2. **Log in manually** via noVNC (real typing, 2FA, checkpoints) instead of automating login.
3. **Keep cookies on the volume** — after login, scrapes reuse the same persistent profile.
4. **Stagger scrapes** — each worker sleeps a random 0–25s before navigation (`WORKER_STAGGER_MAX_MS`).
5. **Low parallelism per account** — each worker runs `--concurrency 1` for one tab.
6. **Optional later**: sticky residential proxy per worker (not wired yet; same container + `HTTP_PROXY` is enough when you add it).

This does **not** guarantee zero blocks; it gives you isolated, logged-in browsers instead of one machine hammering five accounts from one Chrome profile.

## Quick start

From `facebook-scraper/`:

```bash
# 1) Build image (first time, a few minutes)
docker compose build

# 2) Copy URL list
cp docker/urls.example.txt docker/urls.txt
# Edit docker/urls.txt — five post URLs, one per line

# 3) Log in — one worker at a time (recommended)
docker compose run --rm --service-ports fb-worker-1 login
# Browser: http://localhost:6081/vnc.html — sign into Facebook account #1, then Ctrl+C

docker compose run --rm --service-ports fb-worker-2 login
# http://localhost:6082/vnc.html — account #2, etc.
```

Or use the helper (runs workers sequentially):

```bash
chmod +x scripts/docker/*.sh
./scripts/docker/login-all.sh
```

```bash
# 4) Scrape all five URLs in parallel
./scripts/docker/batch-scrape.sh
```

JSON goes to stdout per worker; screenshots/artifacts under `docker/artifacts/worker-N/`.

## Commands inside a worker

```bash
docker compose run --rm --service-ports fb-worker-3 login
docker compose run --rm fb-worker-3 scrape "https://www.facebook.com/..."
docker compose run --rm fb-worker-3 shell
```

Environment:

- `SCRAPE_SCRAPER=post-engagement` — default is `post-screenshot`
- `SCRAPE_WAIT_AFTER_NAVIGATION_MS=6000` — slower navigation

## Apple Silicon

`docker-compose.yml` sets `platform: linux/amd64` because Google’s Chrome package is amd64-only. Docker Desktop will emulate; allow extra RAM (≥ 8 GB for five workers).

## Layout

```text
docker/
  Dockerfile
  entrypoint.sh
  start-display.sh
  profiles/worker-{1..5}/   # gitignored — Chrome user data
  artifacts/worker-{1..5}/  # gitignored — scrape output
  urls.txt                  # your five URLs (gitignored)
  urls.example.txt
scripts/docker/
  batch-scrape.sh
  login-all.sh
```

## Next steps (not in this PR)

- Per-worker HTTP proxy in compose
- Health check that profile has `c_user` cookie before scrape
- Orchestrator API (spin workers on demand in cloud)
- CDP attach from host instead of in-container scrape
