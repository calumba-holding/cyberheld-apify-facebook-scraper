# LLM Triage (#41, P5)

Flags which of thousands of captured comments **plausibly cross the legal threshold**,
so human review time goes to the ~30 that matter — the throughput edge existing legal
tools lack. See `../../docs/evidence-capture-architecture.md`.

## What it does

`triage_job(session, job_id, classifier, cutoff)` reads a job's content items from the
Metadata DB, scores each `0..1`, and writes **`triage_flags`** — derived metadata, in
its own table. It **never touches sealed artifacts** (no `media_assets`, no custody
edits): triage is a prioritization index, not a legal determination.

## Classifiers

- **`ClaudeClassifier`** — the real one: **`claude-opus-4-8`** via the Anthropic SDK
  with structured output (`score` + one-sentence `rationale`). Needs `ANTHROPIC_API_KEY`
  (or an `ant auth login` profile); the SDK import is lazy so the pipeline runs offline.
- **`FakeClassifier`** — deterministic keyword scorer for tests/dev.

Both return only a **score + rationale** — never a "guilty/illegal" verdict. The system
prompt states prioritization-only, human-in-the-loop; the code enforces the same shape.

## Run

```bash
cd platform/metadata-db && docker compose up -d
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
export ANTHROPIC_API_KEY=...   # only for ClaudeClassifier
cd ../triage && pip install -r requirements.txt
python -c "from triage.engine import make_engine, migrate_up; migrate_up(make_engine())"
pytest    # offline via FakeClassifier
```
