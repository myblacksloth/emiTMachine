DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'administrative_request_type') THEN
    CREATE TYPE administrative_request_type AS ENUM ('vacation', 'leave', 'smart_working', 'activity_change');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'administrative_request_status') THEN
    CREATE TYPE administrative_request_status AS ENUM ('pending', 'approved', 'revoked');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS administrative_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type administrative_request_type NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  status administrative_request_status NOT NULL DEFAULT 'pending',
  note text,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  deleted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  activity_change_action text,
  activity_change_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT administrative_requests_end_after_start CHECK (ended_at > started_at),
  CONSTRAINT administrative_requests_decision_state CHECK ((status = 'pending') = (decided_at IS NULL))
);

ALTER TABLE administrative_requests
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS activity_change_action text,
  ADD COLUMN IF NOT EXISTS activity_change_payload jsonb;

ALTER TYPE administrative_request_type ADD VALUE IF NOT EXISTS 'activity_change';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'administrative_requests_no_overlap'
      AND conrelid = 'administrative_requests'::regclass
  ) THEN
    ALTER TABLE administrative_requests DROP CONSTRAINT administrative_requests_no_overlap;
  END IF;

  ALTER TABLE administrative_requests
    ADD CONSTRAINT administrative_requests_no_overlap
    EXCLUDE USING gist (
      user_id WITH =,
      (tstzrange(started_at, ended_at, '[)')) WITH &&
    )
    WHERE (deleted_at IS NULL);
END;
$$;

CREATE INDEX IF NOT EXISTS administrative_requests_user_status_idx ON administrative_requests (user_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS administrative_requests_status_idx ON administrative_requests (status, started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'administrative_requests_activity_change_payload'
      AND conrelid = 'administrative_requests'::regclass
  ) THEN
    ALTER TABLE administrative_requests
      ADD CONSTRAINT administrative_requests_activity_change_payload CHECK (
        (request_type <> 'activity_change' and activity_change_action is null and activity_change_payload is null)
        or
        (request_type = 'activity_change' and activity_change_action in ('create', 'update', 'delete') and activity_change_payload is not null)
      );
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS administrative_requests_set_updated_at ON administrative_requests;
CREATE TRIGGER administrative_requests_set_updated_at BEFORE UPDATE ON administrative_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
