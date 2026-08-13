# Local Docker control plane

The supported product topology is a local Docker platform:

```text
Dashboard :3100
  → Control API :8080
    → one Docker container per login, scrape, or watch job
      → persistent worker-N Facebook and Instagram profiles
      → persistent worker-N artifact directory
```

## Lifecycle

1. `POST /v1/jobs` validates a Facebook or Instagram post/reel/profile URL.
2. The API leases one of five profile slots.
3. If the slot lacks `c_user` and `xs` cookies, the job becomes `needs_authentication` and returns copyable authentication curl commands.
4. `POST /v1/jobs/{id}/authentication/start` starts the noVNC login container; the operator signs in, checks `GET /v1/jobs/{id}/authentication`, then explicitly calls `POST /v1/jobs/{id}/authentication-complete`.
5. The login container stops and a fresh scrape container starts with the same persistent profile mounted.
6. Metadata is stored in `runs/api/control-plane.sqlite3`; the complete scraper envelope is stored in `runs/api/jobs/{id}/result.json`.
7. When `continue_watching=true`, a watch container replaces the scrape container and writes new-comment events under the worker artifact directory.
8. `DELETE /v1/jobs/{id}/watch` stops the watch and releases the profile slot.

## Start

```bash
docker compose build
docker compose up -d control-api dashboard
```

Open `http://127.0.0.1:3100`. Swagger is at `http://127.0.0.1:8080/docs`; ReDoc is at `http://127.0.0.1:8080/redoc`.

For complete prerequisites, new-PC setup, API curl commands, direct CLI commands, updates, persistence, and troubleshooting, see [NEW-PC-SETUP.md](NEW-PC-SETUP.md).

The dashboard provides:

- responsive desktop/tablet/mobile layouts
- job search, worker/status filters, sorting, page-size selection, and pagination
- session authentication state and live noVNC links
- start-authentication and resume controls
- real-time Docker logs for login, scrape, and watch containers
- result summaries, saved paths, full JSON, and downloads
- watch events plus stop/restart controls
- worker-thread sidebar with per-worker scoped jobs, status, and authentication
- dynamic local worker creation with persistent profile/artifact directories
- docked right-side noVNC TV monitor with fullscreen expansion
- expandable New Capture form with an interactive curl composer
- worker-level authenticate, verify-login, and reauthenticate controls

Worker services are behind the `workers` Compose profile and do not stay running. The API creates them with `docker compose run` for each operation.

## Persistence

- account sessions: `docker/profiles/worker-N/`
- scrape/watch artifacts: `docker/artifacts/worker-N/`
- API metadata: `runs/api/control-plane.sqlite3`
- structured result: `runs/api/jobs/{jobId}/result.json`
- generated watch config: `runs/api/jobs/{jobId}/watch-config.json`

`docker compose down --remove-orphans` removes containers and networks but preserves these bind-mounted files.

## API

- `GET /v1/sessions`
- `POST /v1/jobs`
- `GET /v1/jobs`
- `GET /v1/jobs/{id}`
- `GET /v1/jobs/{id}/result`
- `GET /v1/jobs/{id}/result/summary`
- `GET /v1/jobs/{id}/result/download`
- `GET /v1/jobs/{id}/events`
- `GET /v1/jobs/{id}/logs?tail=200`
- `POST /v1/jobs/{id}/authentication-complete`
- `POST /v1/jobs/{id}/authentication/start`
- `GET /v1/jobs/{id}/authentication`
- `DELETE /v1/jobs/{id}/watch`
- `POST /v1/jobs/{id}/watch/restart`

`POST /v1/jobs` accepts `action: scrape | watch | profile`. The API maps these actions onto the internal scraper and watch settings. This is the supported client interface; direct `docker compose run` commands are operational troubleshooting tools only.

Worker registry endpoints:

- `GET /v1/workers`
- `POST /v1/workers`
- `POST /v1/workers/{worker}/authentication/start`
- `POST /v1/workers/{worker}/authentication/finish`

Swagger UI at `/docs` includes the end-to-end workflow, request schemas, worker operations, job controls, sessions, results, logs, watches, and cancellation. ReDoc is available at `/redoc`.

The local deployment mounts `/var/run/docker.sock` into the control API. Treat the API as privileged and do not expose port 8080 outside a trusted host without authentication and network controls.

## Save results without printing JSON

Completed job responses include a `next_actions.download_result` command. It uses curl's `--output` option so the large JSON result is written directly to a file rather than printed in the terminal:

```bash
curl -sS http://127.0.0.1:8080/v1/jobs/JOB_ID/result/download \
  --output JOB_ID-result.json
```

Use the compact summary endpoint for terminal inspection:

```bash
curl -sS http://127.0.0.1:8080/v1/jobs/JOB_ID/result/summary | jq
```

The dashboard shows the server-side `result_path`, suggested download filename, summary counts, and buttons to download or open the complete JSON.