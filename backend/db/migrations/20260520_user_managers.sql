CREATE TABLE IF NOT EXISTS user_managers (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manager_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, manager_user_id),
  CONSTRAINT user_managers_no_self_assignment CHECK (user_id <> manager_user_id)
);

CREATE INDEX IF NOT EXISTS user_managers_user_idx ON user_managers (user_id);
CREATE INDEX IF NOT EXISTS user_managers_manager_idx ON user_managers (manager_user_id);
