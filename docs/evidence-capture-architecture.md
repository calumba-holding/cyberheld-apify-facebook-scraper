# Evidence Capture Architecture (target)

> Source of truth: `evidence-capture-architecture.tldr`. This document is the version-controlled
> transcription of that board plus the build plan derived from it. `docs/architecture.md` still
> describes the **current** local CLI; this describes where it is going.

## One line

**One door in, one sealed package out.** A unified evidence-capture platform where the capture layer
is pluggable — phones, browsers, and CLIs all sit behind the same worker contract — and nothing reaches
storage unsealed. The output is a legally defensible evidence package, not a scrape.

## Flow

```mermaid
flowchart TB
  CaseUI[Case UI — caseworker pastes a link]
  MCP[MCP / chat control — plain-language requests]
  API[Direct API clients — other systems, batch jobs]

  INGEST[INGEST API — the one door<br/>FastAPI · API-key auth · 202 + job_id, never blocks]
  TEMPORAL[Durable Workflow Engine — Temporal<br/>one workflow per job · step journal = chain of custody]
  ROUTER[Capability Router<br/>per-pool queues · independent concurrency limits]

  POOL[(Account & Session Pool<br/>health-scored · quarantine-first · 1 acct ↔ 1 profile)]

  BROWSER[Browser Workers ✅<br/>Docker + Chrome persistent profile]
  DEVICE[Device Workers<br/>10× Android · adb + UiAutomator]
  WATCH[Watch Workers ✅<br/>always-on poll · comment diff · incident cap]
  PROC[Processing Workers<br/>yt-dlp → ffmpeg → Whisper · OCR]
  CONN[Connector Workers<br/>email verify · domain lookup · outside APIs]

  SEAL[SEALING SERVICE — only route to storage<br/>① SHA-256 ② RFC 3161 TSA ③ signed manifest + custody log]

  WORM[(Object Store — WORM<br/>MinIO / S3 Object Lock · retention + legal hold)]
  META[(Metadata DB — Postgres<br/>cases · jobs · step journal · hashes)]

  PKG[Evidence Package<br/>zip + manifest + custody log]
  TRIAGE[LLM Triage<br/>flags the ~30 of 4,000 comments that matter]
  NOTIFY[Notify<br/>webhook · email · MCP callback · GET /jobs/id]

  CaseUI --> INGEST
  MCP --> INGEST
  API --> INGEST
  INGEST --> TEMPORAL --> ROUTER
  ROUTER --> BROWSER & DEVICE & WATCH & PROC & CONN
  POOL --> BROWSER & DEVICE
  BROWSER & DEVICE & WATCH & PROC & CONN --> SEAL
  SEAL --> WORM & META
  WORM --> PKG
  META --> TRIAGE & NOTIFY
```

## Status legend (from the board)

- 🟢 **BUILT — running today:** Browser Workers, Watch Workers
- 🟡 **ADAPT — exists, needs porting:** current fb/ig capture code, ffmpeg recording (→ Processing), connector stubs
- 🔵 **NEW — to build:** Ingest API, Temporal, Capability Router, Account & Session Pool, Device Workers,
  Sealing Service, Object Store, Metadata DB, Evidence Package, LLM Triage, Notify

## Components

| Component | Status | What it is |
|---|---|---|
| **Entry points** | 🔵 | Case UI (paste a link), MCP/chat control, Direct API clients — all hit one door. |
| **Ingest API** | 🔵 | FastAPI. API-key auth, validates, opens a case record, returns `202 + job_id` immediately, never blocks. Routes: `/fb/profile · /fb/post · /fb/reel · /ig/profile · /ig/post · /tiktok/profile · /tiktok/post` and `/enrich/*`. |
| **Durable Workflow Engine** | 🔵 | Temporal. One workflow per job; writes each step before doing it, ticks it off after; crash at step 6 resumes at step 6. The execution journal **is** the chain of custody — machine-generated, not written up afterward. |
| **Capability Router** | 🔵 | Per-pool queues with independent concurrency limits so heavy video jobs cannot starve capture devices. |
| **Account & Session Pool** | 🔵 | Health-scored pooled resource. Quarantine on first warning rather than run-until-banned. 1 account ↔ 1 profile/device, never swapped. Attrition is an operating cost, not a bug. |
| **Browser Workers** | 🟢 | Docker + Chrome persistent profile, 1 account ↔ 1 profile volume, fb/ig profile + post-engagement, noVNC login once per worker. 5 running today. |
| **Device Workers** | 🔵 | 10× Android, adb + UiAutomator, real IG/FB apps — app-only content and the view a real user actually sees. Add only where browser fails. |
| **Watch Workers** | 🟢 | Always-on poll, comment diff, incident cap (50 events / 120s gap / 600s). Fires an event the moment a new comment appears — this is what beats the delete button. |
| **Processing Workers** | 🟡 | yt-dlp → ffmpeg → Whisper, OCR on frames. Reel/video download, transcription, searchable text. Separate pool, own limit. |
| **Connector Workers** | 🟡 | Thin wrappers on outside APIs (email verify, domain lookup, whatever you already pay for). Where tool sprawl gets absorbed. |
| **Sealing Service** | 🔵 | The **only** route to storage; nothing is stored unsealed. ① SHA-256 of every artifact ② RFC 3161 trusted timestamp (eIDAS-qualified TSA for EU proceedings) ③ signed manifest + custody log. The line between "a screenshot of what I saw" and "this existed at 14:32 and has not been touched since." |
| **Object Store (WORM)** | 🔵 | MinIO / S3 with Object Lock — write-once. Per-case retention schedule + legal-hold flag. Indefinite retention of personal data is not GDPR-defensible; decide before launch. |
| **Metadata DB** | 🔵 | Postgres. Cases, jobs, step journal, entities, content items, media assets, hashes — the queryable index over sealed evidence. |
| **Evidence Package** | 🔵 | zip + manifest + custody log, ready to attach to a filing. Still valid after every one of those accounts is deleted. |
| **LLM Triage** | 🔵 | Flags which of ~4,000 comments plausibly cross the legal threshold, so review time goes to the ~30 that matter — the throughput edge existing legal tools lack. |
| **Notify** | 🔵 | webhook · email · MCP callback ("job done, 63 captures sealed"); `GET /jobs/{id}` any time. |

## Out of scope (stated up front)

The system **does not identify anyone**. Capture yields a handle: `@username`. Going from handle to human
requires a legal disclosure route (court order / statutory information claim against the platform). The
system builds the evidence package that *supports* that request — it does not unmask. Stated up front so
expectations and platform-ToS exposure stay aligned.

## Where the current codebase fits

The existing `facebook-scraper/` repo is the two 🟢 boxes and their seams — nothing above the worker line exists yet.

| Diagram box | Current code | Status |
|---|---|---|
| Browser Workers | `src/facebook/`, `src/instagram/` scrapers; `docker/` + noVNC | 🟢 (gaps: #29 fb-profile, #30 ig-20posts) |
| Watch Workers | `src/watch/` (poller, incident, comment-diff) | 🟢 (gap: #31 ig-parity) |
| "same worker contract" | `src/registry.ts` plugin/target contract | 🟢 the integration seam the Router will reuse |
| Processing Workers | `src/common/screen-recording.ts` (ffmpeg) | 🟡 seed only |
| tiktok capture | — | 🔵 #32 |
| Everything above the workers | — | 🔵 no code today |

## Stack note — deliberately polyglot

The control plane on the board is **Python** (FastAPI · Temporal · Postgres · MinIO · Whisper). The capture
code is **Node/TypeScript + Playwright**. This is intentional: the TS scrapers are **not** rewritten — they
become the *Browser Workers* pool behind the router's worker contract. `src/registry.ts` is why the router
can treat browser / device / CLI capture uniformly. The seam between the two languages is the worker
contract (a job spec in, a set of raw artifacts + a step journal out), consumed by the Sealing Service.

## Build plan (derived)

Sequenced so the thing that makes it *evidence* comes before the thing that makes it *convenient*.

- **Phase 0 — Close the capture matrix (in flight).** Issues #29 (fb profile), #30 (ig 20-posts),
  #31 (ig watch parity), #32 (tiktok). Valuable regardless of the platform above; keeps the 🟢 boxes complete.
- **Phase 1 — Custody spine (build first).** Metadata DB (Postgres) → Sealing Service (SHA-256 + RFC 3161
  TSA + signed manifest) → Object Store (WORM). Route existing capture output *through* sealing. Without
  this, nothing captured is evidence.
  - **Metadata DB (#33) — implemented** in [`platform/metadata-db/`](../platform/metadata-db/).
    Stack decision (recorded per issue #33): **Python 3.11+ · SQLAlchemy 2.0 · Postgres 17**, matching
    the board's Python control plane. SQL migrations are the authoritative schema; the ORM mirrors them.
    Custody-log integrity (append-only `job_steps`, 1:1 hashes) is enforced by DB triggers/constraints and
    covered by tests against a real Postgres.
- **Phase 2 — The one door + durability.** Ingest API (FastAPI, 202 + job_id) + Temporal (workflow per job,
  step journal) + Capability Router (per-pool queues). Make the Node capture workers callable behind the contract.
- **Phase 3 — Account & Session Pool.** Health-scoring + quarantine over the existing per-worker profiles.
- **Phase 4 — Expand capture surface.** Device Workers (Android), Processing Workers (yt-dlp/ffmpeg/Whisper/OCR),
  Connector Workers.
- **Phase 5 — Outputs & intelligence.** Evidence Package builder, LLM Triage, Notify.

Issues #29–32 are the whole of Phase 0 and the bottom-left corner of the board; the phases above them are net-new.
