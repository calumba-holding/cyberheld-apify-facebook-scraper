# Evidence Package (#40, P5)

The deliverable the whole system exists to produce: a **self-contained `zip`** for a
job, ready to attach to a filing — and **still valid after every source account, post,
or the live systems are gone**. See `../../docs/evidence-capture-architecture.md`.

## Contents

```
package_manifest.json   # signed: job/case, per-artifact SHA-256 + RFC 3161 token
package_manifest.sig    # Ed25519 signature over the manifest
public_key.b64          # to verify the signature offline
custody_log.json        # the machine-generated chain of custody (job steps)
artifacts/<object_key>  # the sealed artifact bytes
README.txt
```

## Build & verify

```python
zip_bytes = build_package(session, job_id, storage)   # composes DB + WORM + sealing
ok, problems = verify_package_zip(zip_bytes)           # offline: signature + re-hash every file
```

Verification needs **nothing but the zip** — it checks the signature over the manifest
and re-hashes every file under `artifacts/`. Tampering with any file, or the manifest,
fails verification.

## Tests

`pytest` builds a package from real sealed data (Postgres + WORM), verifies it offline,
proves tamper-detection, and proves it still verifies **after the DB and WORM store are
deleted**.
