ALTER TABLE administrative_requests
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

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
