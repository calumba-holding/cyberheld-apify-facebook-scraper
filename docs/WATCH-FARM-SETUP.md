# Watch farm — complete setup and usage

This guide walks through **Pascal’s step 1**: five isolated Docker workers, five Facebook accounts (manual login once), five post URLs watched in parallel, with **JSON comment events** when new comments appear.

---

## What you get

| Component | What it does |
|-----------|----------------|
| **5 Docker workers** (`fb-worker-1` … `fb-worker-5`) | Separate sandboxes — no shared cookies |
| **Profile volumes** `docker/profiles/worker-N/` | Persistent login (cookies survive restarts) |
| **noVNC** ports `6081`–`6085` | See Chrome and log in manually |
| **Watch config** `farm/config/worker-N.json` | Which post URL(s) each worker watches |
| **Artifacts** `docker/artifacts/worker-N/watch/...` | `state.json`, `events/*.json`, `incidents/*.json` |

Each worker:

1. Opens Chrome with **its own** saved Facebook session.
2. Polls the configured post URL every **90 seconds** (default).
3. On the **first** successful poll: **baselines** existing comments (no event flood).
4. On later polls: writes one **JSON file per new comment**.

---

## Requirements

- **Docker Desktop** (Mac or Linux)
- **Node.js 20+** on the host (scripts build `dist/` before watch)
- **~8 GB RAM** if running all five workers on one Mac (amd64 emulation on Apple Silicon)
- Five **different** Facebook accounts (one per worker)

---

## Architecture (one sentence)

**One Facebook account → one worker → one profile volume → one (or more) post URLs → comment events on disk.**

Never swap profiles between workers.

---

## Step 1 — Clone, install, build image

```bash
cd facebook-scraper

npm install
docker compose build
```

First image build can take several minutes.

---

## Step 2 — Create config for all five workers

Generate config files from the example (skips files that already exist):

```bash
chmod +x scripts/docker/*.sh
./scripts/docker/setup-all-worker-configs.sh
```

You get:

```text
farm/config/worker-1.json
farm/config/worker-2.json
…
farm/config/worker-5.json
```

These files are **gitignored** (they contain your URLs and account refs).

### Map one post URL per worker (recommended)

Edit each `farm/config/worker-N.json`:

| Worker | `workerId` | `accountRef` | `posts[0].postUrl` |
|--------|------------|--------------|---------------------|
| 1 | `fb-worker-1` | `cm-001` | Post URL #1 |
| 2 | `fb-worker-2` | `cm-002` | Post URL #2 |
| 3 | `fb-worker-3` | `cm-003` | Post URL #3 |
| 4 | `fb-worker-4` | `cm-004` | Post URL #4 |
| 5 | `fb-worker-5` | `cm-005` | Post URL #5 |

**Example** — one post per worker:

```json
{
  "workerId": "fb-worker-2",
  "accountRef": "cm-002",
  "pollIntervalSeconds": 90,
  "commentsOnly": true,
  "incident": {
    "gapSeconds": 120,
    "maxEvents": 50,
    "maxDurationSeconds": 600
  },
  "posts": [
    {
      "postUrl": "https://www.facebook.com/share/p/YOUR_POST_ID/"
    }
  ]
}
```

**Tips for URLs**

- Full post URLs and `share/p/...` links both work; share links are resolved automatically.
- Prefer the canonical post URL if you have it: `https://www.facebook.com/<page>/posts/<id>`.
- You can list **multiple** posts in `posts[]` for one worker; the watcher polls each in order every tick.

**Recommended settings** (already in the example):

- `"commentsOnly": true` — faster polls (skips reaction scraping).
- `"pollIntervalSeconds": 90` — avoids overlapping polls (each tick can take 2–4 minutes).

---

## Step 3 — Log in once per worker (manual, via noVNC)

Each worker needs its **own** Facebook account logged in **once**. Cookies are stored on the profile volume.

### Option A — one worker at a time (clearest)

```bash
./scripts/docker/observe-login.sh 1
```

1. Open **http://127.0.0.1:6081/vnc.html?path=websockify&autoconnect=1&resize=scale**
2. Wait for the green terminal hint, then press **Enter** in the Mac terminal when the desktop is visible.
3. Log into Facebook account **#1** in Chrome.
4. Press **Enter** in the terminal when login is finished.

Repeat for workers 2–5:

```bash
./scripts/docker/observe-login.sh 2   # noVNC on port 6082
./scripts/docker/observe-login.sh 3   # 6083
./scripts/docker/observe-login.sh 4   # 6084
./scripts/docker/observe-login.sh 5   # 6085
```

### noVNC URL table

| Worker | noVNC (on your Mac) |
|--------|---------------------|
| fb-worker-1 | http://127.0.0.1:6081/vnc.html?path=websockify&autoconnect=1&resize=scale |
| fb-worker-2 | http://127.0.0.1:6082/vnc.html?path=websockify&autoconnect=1&resize=scale |
| fb-worker-3 | http://127.0.0.1:6083/vnc.html?path=websockify&autoconnect=1&resize=scale |
| fb-worker-4 | http://127.0.0.1:6084/vnc.html?path=websockify&autoconnect=1&resize=scale |
| fb-worker-5 | http://127.0.0.1:6085/vnc.html?path=websockify&autoconnect=1&resize=scale |

noVNC only works **while** the login or watch container is running.

---

## Step 4 — Smoke test (one poll, then exit)

Before running 24/7, verify one worker:

```bash
./scripts/docker/watch-dev.sh 1 --once
```

Expect in the logs:

- `Watch service: fb-worker-1, 1 post(s), poll every 90s (comments-only)`
- `Chrome is running on the virtual display`
- `Baselined N existing comment(s) on post (no events emitted).` — first run only

Artifacts:

```text
docker/artifacts/worker-1/watch/fb-worker-1/state.json
```

---

## Step 5 — Run always-on watch

### Single worker (foreground)

```bash
./scripts/docker/watch-dev.sh 1
```

Keep the terminal open. Ctrl+C stops the worker.

### All five workers in parallel (one terminal)

```bash
./scripts/docker/watch-all-dev.sh
```

Ctrl+C stops all five.

### Run five workers in five terminals (easiest to read logs)

```bash
./scripts/docker/watch-dev.sh 1
./scripts/docker/watch-dev.sh 2
# … etc.
```

---

## What “working” looks like in the logs

### Baseline (first successful poll)

```text
Baselined 23 existing comment(s) on post (no events emitted).
```

Existing comments are stored in `state.json` — they are **not** emitted as events.

### New comment detected

```text
New comments: 1 on https://www.facebook.com/...
Event b8dbd301-24c4-4503-8ddf-83b9633fefe2 — new comment on ... (Engelbert Humperding)
```

Each `Event <uuid>` is a **JSON file** on disk.

### Incident grouping

Bursts of new comments are grouped under an `incidentId`. When limits are hit:

```text
Closed incident ... (max_duration) with 9 events.
```

Default caps: 50 events / 600 seconds / 120s gap (configurable in `incident` block).

### Skipped tick (normal)

```text
Skipping watch tick — previous poll still running.
```

The poll took longer than 90s; the next scheduled tick is skipped to avoid two Chromes scraping at once. Increase `pollIntervalSeconds` to 180 if this happens often.

---

## Where outputs are written

Per worker `N`:

```text
docker/artifacts/worker-N/watch/fb-worker-N/
  state.json              # last seen comment keys, session health, open incident
  events/
    YYYY-MM-DD/
      <eventId>.json      # one file per new comment
  incidents/
    <incidentId>.json     # summary when an incident closes
```

### Event JSON (what downstream systems consume)

Each event includes:

- `eventId`, `workerId`, `accountRef`, `observedAt`
- `postUrl`
- `comment` — user, content, id, timestamp (when available)
- `detection` — method, latency
- `session.sessionOk` — login wall / scrape failure signal

---

## Operations cheat sheet

| Task | Command |
|------|---------|
| Build image | `docker compose build` |
| Create configs | `./scripts/docker/setup-all-worker-configs.sh` |
| Login worker N | `./scripts/docker/observe-login.sh N` |
| Watch one worker | `./scripts/docker/watch-dev.sh N` |
| Watch all five | `./scripts/docker/watch-all-dev.sh` |
| One poll smoke test | `./scripts/docker/watch-dev.sh N --once` |
| Reset baseline after URL change | `rm docker/artifacts/worker-N/watch/fb-worker-N/state.json` |

---

## Troubleshooting

### `Bind for 0.0.0.0:5901 failed: port is already allocated`

An old container is still running:

```bash
docker ps --filter "publish=5901"
docker stop <container_id>
```

Or stop all scraper containers:

```bash
docker ps | grep fb-worker
```

### `the input device is not a TTY`

Use the provided scripts (`watch-dev.sh`, `watch-all-dev.sh`). They pass `docker compose run -T` for background-friendly runs.

### Wrong post in noVNC

Check `farm/config/worker-N.json` — only URLs in `posts[]` are watched. Restart watch after edits.

### `Extracted 0 comments` then recovery

The scraper reloads the post once automatically. If it still returns 0, check noVNC for a login wall or blocked page (`SESSION UNHEALTHY` in logs / `state.json`).

### Too many “new comment” events after baseline

Usually a partial scrape (22 vs 48 comments visible). Let it run with the latest code (zero-comment recovery + scoping fixes). If needed, delete `state.json` and re-baseline during a quiet period.

### Chrome “Restore pages?” bubble

Recent images disable this in Docker. Rebuild and restart:

```bash
npm run build
./scripts/docker/watch-dev.sh 1
```

---

## Safety notes (reducing blocks)

1. **One real account per worker volume** — never reuse.
2. **Manual login** via noVNC (2FA, checkpoints).
3. **Do not** run five workers on a weak laptop indefinitely — prefer a Linux host for production.
4. Use **`commentsOnly: true`** and **`pollIntervalSeconds: 90`** (or higher).
5. Stagger starts: `watch-all-dev.sh` already launches workers in parallel; for production, consider starting workers 30–60s apart.

---

## Next steps (roadmap)

| Item | GitHub issue |
|------|----------------|
| A) Always-on ops (`docker compose up`, restart policies) | [#21](https://github.com/calumba-holding/cyberheld-apify-facebook-scraper/issues/21) |
| B) Better scoping for share URLs | [#22](https://github.com/calumba-holding/cyberheld-apify-facebook-scraper/issues/22) |
| C) Central collector (webhook / Postgres) | [#23](https://github.com/calumba-holding/cyberheld-apify-facebook-scraper/issues/23) |
| D) Screenshot/video per event | [#24](https://github.com/calumba-holding/cyberheld-apify-facebook-scraper/issues/24) |

---

## Related docs

- [docker-infrastructure.md](./docker-infrastructure.md) — batch scrape (non-watch) use case
- [../farm/README.md](../farm/README.md) — config file reference
- [../scripts/docker/README.md](../scripts/docker/README.md) — script index
