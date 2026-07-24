-- Notify (#42, P5) — delivery audit log. Derived metadata; never touches sealed evidence.

BEGIN;

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     uuid NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  channel    text NOT NULL,                 -- webhook | email | mcp
  target     text NOT NULL,                 -- url / address
  delivered  boolean NOT NULL,
  attempts   int NOT NULL,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_job_id_idx ON notifications(job_id);

COMMIT;
