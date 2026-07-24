-- Evidence-capture Metadata DB — initial schema (issue #33, P1 custody spine)
-- The queryable index over sealed evidence. job_steps IS the chain-of-custody log.
--
-- Design notes:
--   * job_steps is append-only: rows may be inserted and "ticked off" (state +
--     finished_at) but never deleted, reordered, or have their identity/start
--     rewritten. Enforced by trigger, not convention (issue AC).
--   * hashes link 1:1 to media_assets (UNIQUE media_asset_id).
--   * entities store platform handles only — never resolved identity (out-of-scope:
--     the system does not unmask).

BEGIN;

-- gen_random_uuid() is in core Postgres since 13; no extension needed on PG17.

-- ---------------------------------------------------------------------------
-- Shared: auto-maintain updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ec_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- cases — opened by the Ingest API on request intake
-- ---------------------------------------------------------------------------
CREATE TABLE cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref    text,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed')),
  legal_hold      boolean NOT NULL DEFAULT false,
  retention_until timestamptz,          -- per-case retention (mirrors WORM policy, #35)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER cases_updated_at BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION ec_set_updated_at();

-- ---------------------------------------------------------------------------
-- jobs — one per capture/enrich request
-- ---------------------------------------------------------------------------
CREATE TABLE jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  job_type   text NOT NULL,             -- e.g. 'fb/post', 'ig/profile', 'enrich/email-verify'
  target_url text,
  status     text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','sealing','succeeded','failed','partial')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_case_id_idx ON jobs(case_id);
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION ec_set_updated_at();

-- ---------------------------------------------------------------------------
-- job_steps — the append-only custody log (written by Temporal, #37)
-- ---------------------------------------------------------------------------
CREATE TABLE job_steps (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  step_index  int NOT NULL,
  name        text NOT NULL,
  state       text NOT NULL DEFAULT 'started'
                CHECK (state IN ('started','succeeded','failed','skipped')),
  detail      jsonb,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (job_id, step_index)
);
CREATE INDEX job_steps_job_id_idx ON job_steps(job_id);

-- Append-only enforcement: no deletes; on update only state/finished_at/detail may
-- change and only forward (a step already succeeded/failed/skipped is terminal).
CREATE OR REPLACE FUNCTION ec_job_steps_append_only() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    RAISE EXCEPTION 'job_steps is append-only: deletes are not permitted (custody log)';
  END IF;
  -- UPDATE path
  IF NEW.job_id     IS DISTINCT FROM OLD.job_id
     OR NEW.step_index IS DISTINCT FROM OLD.step_index
     OR NEW.name       IS DISTINCT FROM OLD.name
     OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'job_steps is append-only: cannot rewrite job_id/step_index/name/started_at';
  END IF;
  IF OLD.state <> 'started' AND NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'job_steps: step is terminal, its state cannot change (custody log)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER job_steps_append_only
  BEFORE UPDATE OR DELETE ON job_steps
  FOR EACH ROW EXECUTE FUNCTION ec_job_steps_append_only();

-- ---------------------------------------------------------------------------
-- entities — platform handles only (NEVER resolved identity)
-- ---------------------------------------------------------------------------
CREATE TABLE entities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok')),
  handle       text NOT NULL,           -- @username
  display_name text,                     -- as shown on the platform; not identity resolution
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);

-- ---------------------------------------------------------------------------
-- content_items — posts/comments/reels/etc captured for a job
-- ---------------------------------------------------------------------------
CREATE TABLE content_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  entity_id   uuid REFERENCES entities(id) ON DELETE SET NULL,
  platform    text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok')),
  item_type   text NOT NULL CHECK (item_type IN ('profile','post','comment','reel','photo')),
  source_url  text,
  payload     jsonb,                     -- extracted structured data
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_items_job_id_idx ON content_items(job_id);
CREATE INDEX content_items_entity_id_idx ON content_items(entity_id);

-- ---------------------------------------------------------------------------
-- media_assets — artifact refs -> WORM object-store keys (#35)
-- ---------------------------------------------------------------------------
CREATE TABLE media_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN
                    ('screenshot','video','image','audio','transcript','ocr','manifest','custody_log','other')),
  object_key      text NOT NULL,         -- key in the WORM object store
  byte_size       bigint,
  mime_type       text,
  sealed_at       timestamptz,           -- set by the Sealing Service (#34)
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_job_id_idx ON media_assets(job_id);
CREATE INDEX media_assets_content_item_id_idx ON media_assets(content_item_id);

-- ---------------------------------------------------------------------------
-- hashes — SHA-256 per artifact, 1:1 with media_assets (#34 writes these)
-- ---------------------------------------------------------------------------
CREATE TABLE hashes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id uuid NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE RESTRICT,
  algo           text NOT NULL DEFAULT 'sha256',
  digest         text NOT NULL,          -- hex-encoded
  rfc3161_token  bytea,                  -- RFC 3161 timestamp token, set by sealing
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMIT;
