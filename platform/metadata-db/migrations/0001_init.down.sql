-- Rollback for 0001_init.sql
BEGIN;
DROP TABLE IF EXISTS hashes;
DROP TABLE IF EXISTS media_assets;
DROP TABLE IF EXISTS content_items;
DROP TABLE IF EXISTS entities;
DROP TABLE IF EXISTS job_steps;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS cases;
DROP FUNCTION IF EXISTS ec_job_steps_append_only();
DROP FUNCTION IF EXISTS ec_set_updated_at();
COMMIT;
