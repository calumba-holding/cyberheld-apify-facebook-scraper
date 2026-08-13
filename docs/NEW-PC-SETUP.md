# Evidence Control — new PC setup and operations

## URLs after startup

- Dashboard and curl composer: [http://127.0.0.1:3100](http://127.0.0.1:3100)
- Swagger UI: [http://127.0.0.1:8080/docs](http://127.0.0.1:8080/docs)
- ReDoc: [http://127.0.0.1:8080/redoc](http://127.0.0.1:8080/redoc)
- OpenAPI JSON: [http://127.0.0.1:8080/openapi.json](http://127.0.0.1:8080/openapi.json)
- API health: [http://127.0.0.1:8080/health](http://127.0.0.1:8080/health)

## 1. Install prerequisites

Install:

1. Docker Desktop
2. Git
3. `just`
4. Optional terminal helpers: `curl` and `jq`

### macOS

```bash
brew install git just jq
```

Install and start Docker Desktop, then confirm:

```bash
docker version
docker compose version
just --version
```

### Windows

Install Docker Desktop with WSL 2, Git, and `just`:

```powershell
winget install Docker.DockerDesktop
winget install Git.Git
winget install Casey.Just
```

Restart the terminal after installation. Run the project commands from WSL when possible.

### Ubuntu/Debian

Install Docker Engine with the Compose plugin using Docker's official repository, then install `just` and `jq`. Confirm the same version commands shown above.

## 2. Clone and enter the repository

```bash
git clone REPOSITORY_URL chrome-scraper-profile
cd chrome-scraper-profile/facebook-scraper
```

All commands below must run from the directory containing `Justfile` and `docker-compose.yml`.

## 3. Build everything

```bash
just build
```

This builds:

- Control API
- Next.js dashboard
- Shared browser worker image
- Facebook and Instagram scraper code

## 4. Start everything

```bash
just start
```

Open:

```text
http://127.0.0.1:3100
```

Check service health:

```bash
docker compose ps
curl -sS http://127.0.0.1:8080/health | jq
```

## 5. Authenticate workers

Worker profiles persist under `docker/profiles/worker-N/`.

### Through the dashboard

1. Select a worker in the left sidebar.
2. Click **Facebook** or **Instagram** in the worker header.
3. Complete sign-in in the right-side TV monitor.
4. Use the platform control again to verify or refresh the session when required.

### Through curl

Facebook:

```bash
curl -sS -X POST \
  'http://127.0.0.1:8080/v1/workers/1/authentication/start?platform=facebook' | jq
```

Instagram:

```bash
curl -sS -X POST \
  'http://127.0.0.1:8080/v1/workers/1/authentication/start?platform=instagram' | jq
```

Open the returned `live_url`, finish login, then verify:

```bash
curl -sS -X POST \
  'http://127.0.0.1:8080/v1/workers/1/authentication/finish?platform=instagram' | jq
```

Facebook and Instagram profiles are independent. One noVNC browser is visible per worker at a time.

## 6. Job curl commands

### Instagram post or reel

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "instagram",
    "action": "scrape",
    "target_url": "https://www.instagram.com/reels/SHORTCODE/",
    "worker": 1
  }' | jq
```

### Instagram profile and latest posts

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "instagram",
    "action": "profile",
    "target_url": "https://www.instagram.com/USERNAME/",
    "worker": 1,
    "max_posts": 20
  }' | jq
```

Instagram profile output includes visible profile metadata, screenshot evidence, and up to `max_posts` deduplicated recent post/reel links.

### Facebook post or reel

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "facebook",
    "action": "scrape",
    "target_url": "FACEBOOK_POST_OR_REEL_URL",
    "worker": 1
  }' | jq
```

### Facebook profile

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "facebook",
    "action": "profile",
    "target_url": "FACEBOOK_PROFILE_URL",
    "worker": 1,
    "max_posts": 20
  }' | jq
```

### Facebook scrape plus continuous comment watch

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "facebook",
    "action": "watch",
    "target_url": "FACEBOOK_POST_URL",
    "worker": 1,
    "poll_interval_seconds": 90
  }' | jq
```

Instagram watch is not currently supported.

## 7. Job operations

Set the returned ID:

```bash
JOB_ID='paste-job-id-here'
```

Check status:

```bash
curl -sS "http://127.0.0.1:8080/v1/jobs/$JOB_ID" | jq
```

Stream recent logs:

```bash
curl -sS "http://127.0.0.1:8080/v1/jobs/$JOB_ID/logs?tail=250" | jq -r '.logs'
```

Compact result summary:

```bash
curl -sS "http://127.0.0.1:8080/v1/jobs/$JOB_ID/result/summary" | jq
```

Open full JSON:

```bash
curl -sS "http://127.0.0.1:8080/v1/jobs/$JOB_ID/result" | jq
```

Download JSON:

```bash
curl -sS "http://127.0.0.1:8080/v1/jobs/$JOB_ID/result/download" \
  --output "$JOB_ID-result.json"
```

Cancel:

```bash
curl -sS -X POST "http://127.0.0.1:8080/v1/jobs/$JOB_ID/cancel" | jq
```

Resume failed/cancelled job:

```bash
curl -sS -X POST "http://127.0.0.1:8080/v1/jobs/$JOB_ID/restart" | jq
```

Stop watch:

```bash
curl -sS -X DELETE "http://127.0.0.1:8080/v1/jobs/$JOB_ID/watch" | jq
```

Restart watch:

```bash
curl -sS -X POST "http://127.0.0.1:8080/v1/jobs/$JOB_ID/watch/restart" | jq
```

## 8. Direct CLI operations

Docker/API is the supported client workflow. Local CLI is useful for development.

Install and compile:

```bash
npm install
npm run build
```

Login:

```bash
node dist/main.js profile login --target facebook
node dist/main.js profile login --target instagram
```

Instagram post/reel:

```bash
node dist/main.js \
  --target instagram \
  --scraper post-engagement \
  --target-url 'INSTAGRAM_POST_OR_REEL_URL'
```

Instagram profile:

```bash
node dist/main.js \
  --target instagram \
  --scraper profile-scraper \
  --target-url 'INSTAGRAM_PROFILE_URL' \
  --max-posts 20
```

Facebook post/reel:

```bash
node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url 'FACEBOOK_POST_OR_REEL_URL'
```

Facebook profile:

```bash
node dist/main.js \
  --target facebook \
  --scraper profile-scraper \
  --target-url 'FACEBOOK_PROFILE_URL' \
  --max-posts 20
```

Multiple URLs:

```bash
node dist/main.js \
  --target instagram \
  --scraper post-engagement \
  --target-url 'URL_1' \
  --target-url 'URL_2' \
  --concurrency 2
```

## 9. Persistence and shutdown

Persisted data:

- Profiles: `docker/profiles/worker-N/`
- Worker artifacts: `docker/artifacts/worker-N/`
- Jobs database: `runs/api/control-plane.sqlite3`
- Results: `runs/api/jobs/JOB_ID/result.json`

Stop services without deleting data:

```bash
docker compose down --remove-orphans
```

Start again:

```bash
just start
```

## 10. Updating

```bash
git pull
just build
just start
```

## Troubleshooting

### Port already allocated

A monitor/auth browser and scrape cannot own the same worker port simultaneously. The control API normally replaces the monitor before running a job. Inspect with:

```bash
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

### Docker mount denied on macOS

Run from the repository root and use `just start`. Ensure the repository parent is shared in Docker Desktop settings if it is outside the default shared user directories.

### View logs

```bash
docker compose logs -f control-api dashboard
```
