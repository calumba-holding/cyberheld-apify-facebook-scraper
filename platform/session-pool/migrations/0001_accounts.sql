-- Account & Session Pool (#43, P3). Accounts are a health-scored pooled resource.
-- 1 account <-> 1 profile/device, never swapped (enforced by UNIQUE(platform, profile_ref)).
-- Quarantine on first warning rather than run-until-banned.

BEGIN;

CREATE OR REPLACE FUNCTION sp_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok')),
  account_ref  text NOT NULL,               -- account label / handle
  profile_ref  text NOT NULL,               -- Chrome profile dir or device id; fixed for life
  state        text NOT NULL DEFAULT 'active'
                 CHECK (state IN ('active','leased','quarantined','retired')),
  health_score int NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  warnings     int NOT NULL DEFAULT 0,
  leased_by    text,
  leased_at    timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, account_ref),
  UNIQUE (platform, profile_ref)            -- never share a profile between accounts
);

-- Fast lease pick: healthiest active account per platform.
CREATE INDEX accounts_lease_idx ON accounts (platform, state, health_score DESC);

CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION sp_set_updated_at();

COMMIT;
