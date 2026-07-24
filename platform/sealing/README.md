# Sealing Service (#34)

**The only route to storage — nothing is stored unsealed.** Phase 1 custody spine.
See `../../docs/evidence-capture-architecture.md` and `../../docs/worker-contract.md`.

For each artifact in a `CaptureBundle`:

1. **① SHA-256** — recorded in the Metadata DB (`hashes`, 1:1 with `media_assets`).
2. **② Trusted timestamp** — an RFC 3161 token from a qualified TSA (see caveat below).
3. **③ Signed manifest + custody log** — a canonical, Ed25519-signed manifest listing
   every artifact, its hash, and its timestamp, plus the machine-generated custody log.

The manifest is **verifiable offline** with only the public key
(`sealing.verify_package`): signature valid **and** every stored artifact still hashes
to what the manifest recorded. Tamper an artifact or the manifest → verification fails.

## ⚠️ Timestamping caveat (production gate)

`LocalDevTimestamper` is a real Ed25519 timestamp but **NOT an eIDAS-qualified TSA** —
dev/tests only. Production must plug a real RFC 3161 qualified TSA into
`Rfc3161HttpTimestamper` before sealing evidence for proceedings. Tracked with the
WORM/GDPR launch gate (#35).

## Storage

`StorageBackend` is the seam for the WORM object store (#35). `LocalWormBackend`
emulates write-once for dev (refuses overwrite). Only the Sealing Service calls `put`.

## Run

```bash
cd platform/metadata-db && docker compose up -d      # Postgres :55432
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
cd ../sealing && pip install -r requirements.txt && pytest
```
