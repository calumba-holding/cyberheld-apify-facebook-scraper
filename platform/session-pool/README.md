# Account & Session Pool (#43, P3)

Authenticated accounts as a **health-scored, pooled resource**. Feeds the Browser and
Device worker pools. See `../../docs/evidence-capture-architecture.md`.

## Rules (enforced)

- **1 account ↔ 1 profile/device, never swapped** — `UNIQUE(platform, profile_ref)`; a
  profile can never be reassigned to another account.
- **Atomic leasing** — `lease(platform)` claims the healthiest `active` account with
  `FOR UPDATE SKIP LOCKED`, so concurrent workers get distinct accounts and never block.
- **Quarantine on first warning** — `report_warning()` moves an account to `quarantined`
  immediately (not leasable) rather than running it until banned.
- **Exhaustion is raised** (`PoolExhausted`), never silently retried — attrition is an
  operating cost, so capacity is surfaced.

## API

```python
pool = SessionPool(session)
pool.register(platform, account_ref, profile_ref)   # add inventory
acct = pool.lease(platform, leased_by=job_id)        # -> Account (state=leased)
pool.release(acct.id)                                # back to active
pool.report_warning(acct.id)                         # -> quarantined
pool.retire(acct.id); pool.clear_quarantine(acct.id)
pool.capacity(platform)                              # {'active': n, 'leased': m, ...}
```

## Integration

Before a Browser/Device job runs, the worker leases an account for the job's platform
and uses its fixed `profile_ref`; on a login-wall / checkpoint it calls `report_warning`
(quarantine) instead of continuing. Lives in the same Postgres as the Metadata DB;
schema in `migrations/0001_accounts.sql` (authoritative).

## Run

```bash
cd platform/metadata-db && docker compose up -d
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
cd ../session-pool && pip install -r requirements.txt
python -c "from session_pool.engine import make_engine, migrate_up; migrate_up(make_engine())"
pytest
```
