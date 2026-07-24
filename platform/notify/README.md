# Notify (#42, P5)

Tells clients a job is done — **webhook · email · MCP callback** ("job done, 63
captures sealed") — and complements the pull side, `GET /jobs/{id}`, which the Ingest
API (#36) already serves. See `../../docs/evidence-capture-architecture.md`.

## Behavior

- `build_notification(session, job_id)` reads the Metadata DB and returns a summary
  payload: `job_id`, `case_id`, `job_type`, `status`, `sealed_captures`, `message`.
- `NotifyService(attempts, backoff_seconds).notify(session, payload, channels)` delivers
  over each channel with **at-least-once retry**, writes one `notifications` audit row
  per channel, and **never raises** — a delivery failure is recorded, not propagated, so
  it can't block or corrupt the sealed record. `notify` only reads the sealed tables.

## Channels (injectable transports)

| Channel | default transport |
|---|---|
| `WebhookChannel(url)` | `httpx.post` (JSON) |
| `McpCallbackChannel(url)` | `httpx.post`, `{type: "mcp_callback", data: …}` envelope |
| `EmailChannel(to)` | stdlib `smtplib` (`SMTP_HOST`/`SMTP_PORT`/`NOTIFY_FROM`) |

All transports are injectable, so delivery is fully testable offline.

## Run

```bash
cd platform/metadata-db && docker compose up -d
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
cd ../notify && pip install -r requirements.txt
python -c "from notify.engine import make_engine, migrate_up; migrate_up(make_engine())"
pytest
```
