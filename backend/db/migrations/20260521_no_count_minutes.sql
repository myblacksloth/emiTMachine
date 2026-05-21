ALTER TABLE time_sessions
  ADD COLUMN IF NOT EXISTS no_count_minutes integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_sessions_no_count_non_negative'
  ) THEN
    ALTER TABLE time_sessions
      ADD CONSTRAINT time_sessions_no_count_non_negative CHECK (no_count_minutes >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_sessions_no_count_within_duration'
  ) THEN
    ALTER TABLE time_sessions
      ADD CONSTRAINT time_sessions_no_count_within_duration CHECK (
        ended_at IS NULL OR no_count_minutes <= floor(extract(epoch from (ended_at - started_at)) / 60)::integer
      );
  END IF;
END $$;
