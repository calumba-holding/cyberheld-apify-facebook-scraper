# Operator Console (Next.js admin)

The face on the platform: manage the **pool of signed-in Chrome sessions**, sign new
ones in, watch a session live (VNC), and **run a job on a post — which must use a
signed-in session** (leases a free one, waits if all busy, or asks you to sign in).

Backs onto the same Postgres `accounts` (session-pool #43) + `jobs`/`cases` tables,
and shells out to the Node scraper (`../../dist/main.js`).

## Run

```bash
# Postgres must be up + the accounts table seeded (see platform/session-pool)
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
# scraper must be built once (for sign-in + capture to work):
( cd ../.. && npm install && npm run build )

cd platform/admin-ui
npm install
npm run dev            # http://localhost:3000
```

Env: `DATABASE_URL`, `SCRAPER_DIR` (default ../../), `SCRAPE_PROFILE_ROOT_DIR`
(default `~/.scrape/profiles`), `NOVNC_BASE` (default `http://localhost:`), `RUNS_DIR`.

## Flow

1. **Session Pool** (`/`) — see every signed-in session + state (active/leased/quarantined),
   health, and capacity tiles. **+ Add to pool** registers a new session; **Sign in**
   opens Chrome to log into the platform (session saved to the profile);
   **Open VNC** shows a Dockerized worker's screen live.
2. **Run a Job** (`/jobs`) — paste a post URL → **Capture**. The pool leases a free
   signed-in session for that platform:
   - free session → job runs on it; watch the live log + custody steps.
   - all busy → "waiting for a free one".
   - none signed in → "sign in at least one first" (links back to the Pool).
   The leased session is released automatically when the scrape finishes.
