# Connector Workers (#39, P4)

Thin, uniform wrappers over outside APIs — the connector pool behind the Ingest API's
`/enrich/*` routes. This is where existing paid tools get absorbed behind one contract
instead of scattering integrations. See `../../docs/evidence-capture-architecture.md`.

## Connectors

| name | job_type | does |
|------|----------|------|
| `email-verify` | `enrich/email-verify` | syntax + MX-based deliverability guess |
| `domain` | `enrich/domain` | resolves A records |

Add one by subclassing `Connector` and calling `register()` — a small, self-contained
module, no cross-service sprawl.

## External access is injected

Connectors take a `Resolver` (or, for HTTP connectors, a client) rather than calling
the network directly, so they are testable offline and real integrations plug in at one
point. `SocketResolver.a()` is real; `mx()` needs a DNS library (e.g. dnspython) in
production.

## Enrichment is evidence too

`seal_connector_result(session, job_id, name, result, storage)` wraps a connector
result as a JSON artifact and seals it (#34) → Metadata DB + WORM, so enrichment lands
in the custody record like any capture.

## Run

```bash
cd platform/connectors && pytest   # offline; the sealing test needs the dev Postgres
```
