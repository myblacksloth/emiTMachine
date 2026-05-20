DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'overtime_mode') THEN
    CREATE TYPE overtime_mode AS ENUM ('overtime', 'time_bank');
  END IF;
 END;
$$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS overtime_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overtime_mode overtime_mode NOT NULL DEFAULT 'overtime',
  ADD COLUMN IF NOT EXISTS weekly_work_minutes integer,
  ADD COLUMN IF NOT EXISTS weekly_work_minutes_set_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_weekly_work_minutes_positive'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_weekly_work_minutes_positive CHECK (weekly_work_minutes IS NULL OR weekly_work_minutes > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_weekly_work_minutes_state'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_weekly_work_minutes_state CHECK ((weekly_work_minutes IS NULL) = (weekly_work_minutes_set_at IS NULL));
  END IF;
 END;
$$;

CREATE TABLE IF NOT EXISTS overtime_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  overtime_minutes integer NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  paid_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT overtime_payments_week_start_monday CHECK (extract(isodow from week_start) = 1),
  CONSTRAINT overtime_payments_minutes_positive CHECK (overtime_minutes > 0),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS overtime_payments_user_week_idx ON overtime_payments (user_id, week_start DESC);
