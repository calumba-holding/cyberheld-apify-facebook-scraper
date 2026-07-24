-- Rollback for 0001_init.sql.
-- CASCADE so teardown is robust to derived tables in other services (triage_flags,
-- notifications, …) that FK these — they are recreated by their own migrations.
BEGIN;
DROP TABLE IF EXISTS hashes CASCADE;
DROP TABLE IF EXISTS media_assets CASCADE;
DROP TABLE IF EXISTS content_items CASCADE;
DROP TABLE IF EXISTS entities CASCADE;
DROP TABLE IF EXISTS job_steps CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS cases CASCADE;
DROP FUNCTION IF EXISTS ec_job_steps_append_only();
DROP FUNCTION IF EXISTS ec_set_updated_at();
COMMIT;
