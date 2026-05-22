ALTER TYPE administrative_request_type ADD VALUE IF NOT EXISTS 'activity_change';

ALTER TABLE administrative_requests
  ADD COLUMN IF NOT EXISTS activity_change_action text,
  ADD COLUMN IF NOT EXISTS activity_change_payload jsonb;

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
