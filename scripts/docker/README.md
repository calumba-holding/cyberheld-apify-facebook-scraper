# Docker commands (run one command per line)

Do **not** paste comment lines (`# ...`) into the terminal.

## noVNC ports (on your Mac)

| Worker | URL |
|--------|-----|
| fb-worker-1 | http://localhost:6081/vnc.html |
| fb-worker-2 | http://localhost:6082/vnc.html |
| … | 6083, 6084, 6085 |

noVNC only works while a container is **running** and you used **`--service-ports`**.

## 1. Rebuild (after code changes)

```bash
cd facebook-scraper
docker compose build fb-worker-1
```

## 2. Config (one or many posts)

```bash
cp farm/config/worker.example.json farm/config/worker-1.json
```

Edit `posts` — add as many `{ "postUrl": "..." }` entries as you need:

```json
"posts": [
  { "postUrl": "https://www.facebook.com/.../posts/pfbid..." },
  { "postUrl": "https://www.facebook.com/.../posts/pfbidOTHER..." }
]
```

## 3. Login (once)

```bash
docker compose run --rm --service-ports fb-worker-1 login
```

Open **http://localhost:6081/vnc.html**, log in, then press **Enter** in the terminal.

## 4. Workers 2–5 configs

```bash
./scripts/docker/setup-all-worker-configs.sh
```

Edit each `farm/config/worker-N.json` with that CM’s post URLs.

## 5. Always-on watch (recommended)

Builds `dist/`, mounts it, starts display + Chrome, polls every `pollIntervalSeconds` (default **90s**), **comments-only** (no reaction scrape):

```bash
./scripts/docker/watch-dev.sh 1
```

Smoke test:

```bash
./scripts/docker/watch-dev.sh 1 --once
```

noVNC: **http://localhost:6081/vnc.html?path=websockify&autoconnect=1&resize=scale**

## 6. Watch with Enter-before-Chrome (debug)

```bash
./scripts/docker/observe-watch.sh 1 --once
```

## 7. Legacy compose watch (rebuild image after code changes)

```bash
docker compose run --rm --service-ports fb-worker-1 watch --once
```

## 8. Reset state after changing post URLs

```bash
rm -f docker/artifacts/worker-1/watch/fb-worker-1/state.json
```
