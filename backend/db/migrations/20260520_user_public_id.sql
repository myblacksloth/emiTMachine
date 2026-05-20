ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_id text;

-- Backfill existing users with a generated UUID-like public identifier.
UPDATE users
SET public_id = gen_random_uuid()::text
WHERE public_id IS NULL OR length(btrim(public_id)) = 0;

ALTER TABLE users
  ALTER COLUMN public_id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN public_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_public_id_not_blank'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_public_id_not_blank CHECK (length(btrim(public_id)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_public_id_key'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_public_id_key UNIQUE (public_id);
  END IF;
END;
$$;
