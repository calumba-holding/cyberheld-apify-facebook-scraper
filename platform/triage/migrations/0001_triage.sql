-- LLM Triage (#41, P5) — derived metadata, SEPARATE from sealed evidence.
-- Triage flags never modify sealed artifacts; they are a prioritization index only.

BEGIN;

CREATE TABLE triage_flags (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  content_item_id   uuid REFERENCES content_items(id) ON DELETE SET NULL,
  score             double precision NOT NULL,   -- 0..1 likelihood of crossing the threshold
  crosses_threshold boolean NOT NULL,
  rationale         text,
  model             text,                          -- classifier that produced this
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX triage_flags_job_id_idx ON triage_flags(job_id);

COMMIT;
