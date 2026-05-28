# Watch farm config

One JSON file per Docker worker. Copy the example and edit post URLs before `watch`.

```bash
cp farm/config/worker.example.json farm/config/worker-1.json
# set workerId to fb-worker-1, accountRef, postUrl(s)
```

### Run watch locally

```bash
# npm (note the -- before flags)
npm run watch -- --config farm/config/worker-1.json --once

# pnpm — do NOT add an extra -- (pnpm already forwards args)
pnpm run watch --config farm/config/worker-1.json --once

# or call the CLI directly
pnpm exec tsx src/main.ts watch --config farm/config/worker-1.json --once
```

`--once` = one poll tick then exit (smoke test). Without it, the process stays running until Ctrl+C.

Docker expects `farm/config/worker-N.json` mounted at `/data/watch-config/worker.json` (see `docker-compose.yml`).

Artifacts written to:

```text
docker/artifacts/worker-N/watch/fb-worker-N/
  state.json
  events/YYYY-MM-DD/{eventId}.json
  incidents/{incidentId}.json
```
