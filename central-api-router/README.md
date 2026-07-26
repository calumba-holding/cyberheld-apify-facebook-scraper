# API Gateway

The central router from the architecture diagram. **One gateway** that routes four
paths to **four separate scraper services**, each its own **docker container** exposing
a single API. The gateway **forwards** the request to the scraper's API and returns its
response — it scrapes nothing, stores nothing, and has **no jobs**.

```
                         ┌─────────────┐
                         │ API Gateway │
                         └──────┬──────┘
   /facebook/watch  ───────────┤   ┌────────────────────────┐  docker: watch-posting
   /facebook/screenshot ───────┼──▶│ API Facebook Screenshot │  docker: screenshot
   /instagram/screenshot ──────┤   │ API Instagram Screenshot│  docker: screenshot
   /facebook/comments ─────────┘   │ API Facebook Comments   │  docker: comments-scraper
                                    └────────────────────────┘
```

## Endpoints (all the gateway has)

| Path | Scraper service | Docker container |
|------|-----------------|------------------|
| `POST /facebook/watch` | API Facebook Watch | `watch-posting` |
| `POST /facebook/screenshot` | API Facebook Screenshot | `screenshot` |
| `POST /instagram/screenshot` | API Instagram Screenshot | `screenshot` |
| `POST /facebook/comments` | API Facebook Comments | `comments-scraper` |

Plus `GET /health` and `GET /` (the route → service map). Nothing else.

Each scraper service exposes one API — the gateway calls `POST {service}/run` and
returns the result. If a scraper service is down, the gateway returns `502
{ "error": "scraper_unavailable", … }`.

## Configure the scraper service URLs

Defaults are docker-compose service names; override per service:

```
SCRAPER_FACEBOOK_WATCH_URL        (default http://facebook-watch:8000)
SCRAPER_FACEBOOK_SCREENSHOT_URL   (default http://facebook-screenshot:8000)
SCRAPER_INSTAGRAM_SCREENSHOT_URL  (default http://instagram-screenshot:8000)
SCRAPER_FACEBOOK_COMMENTS_URL     (default http://facebook-comments:8000)
```

## Run

```bash
cd central-api-router
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn api_router.app:app --port 8080     # docs at http://localhost:8080/docs
pytest
```

Or the whole architecture with docker-compose (gateway + the four scraper-service
containers): `docker compose up`. The scraper services are separate images (each its
own repo/build) — the compose wires the gateway to them.

## Scope

Gateway/routing **only**. Scrapers are separate services, decoupled from the API, each
called via its single API. No capture-endpoint sprawl, no enrich, no jobs, no DB.
