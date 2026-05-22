CREATE TABLE IF NOT EXISTS administrative_request_history (
  request_id uuid NOT NULL REFERENCES administrative_requests(id) ON DELETE CASCADE,
  viewer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  PRIMARY KEY (request_id, viewer_user_id),
  CONSTRAINT administrative_request_history_removed_after_archive CHECK (removed_at IS NULL OR removed_at >= archived_at)
);

CREATE INDEX IF NOT EXISTS administrative_request_history_viewer_idx
ON administrative_request_history (viewer_user_id, archived_at DESC)
WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS administrative_request_history_request_idx
ON administrative_request_history (request_id);
