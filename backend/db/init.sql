CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('user', 'admin', 'root');
CREATE TYPE account_status AS ENUM ('active', 'disabled', 'locked');
CREATE TYPE work_session_status AS ENUM ('open', 'closed', 'anomalous');
CREATE TYPE time_event_type AS ENUM ('clock_in', 'clock_out', 'break_start', 'break_end', 'manual_adjustment');
CREATE TYPE time_event_source AS ENUM ('manual', 'user_confirmed', 'manual_edit', 'csv_import', 'admin_restore');
CREATE TYPE csv_import_status AS ENUM ('uploaded', 'validated', 'imported', 'failed', 'cancelled');
CREATE TYPE auth_challenge_type AS ENUM ('registration', 'login', 'authentication', 'totp_setup', 'totp_login', 'password_recovery');
CREATE TYPE countdown_status AS ENUM ('active', 'completed', 'cancelled');
CREATE TYPE overtime_mode AS ENUM ('overtime', 'time_bank');
CREATE TYPE administrative_request_type AS ENUM ('vacation', 'leave', 'smart_working', 'activity_change');
CREATE TYPE administrative_request_status AS ENUM ('pending', 'approved', 'revoked');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  username citext NOT NULL UNIQUE,
  email citext UNIQUE,
  name text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  status account_status NOT NULL DEFAULT 'active',
  admin_approved boolean NOT NULL DEFAULT true,
  can_edit_sessions boolean NOT NULL DEFAULT true,
  overtime_enabled boolean NOT NULL DEFAULT false,
  overtime_mode overtime_mode NOT NULL DEFAULT 'overtime',
  weekly_work_minutes integer,
  weekly_work_minutes_set_at timestamptz,
  disabled_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_public_id_not_blank CHECK (length(btrim(public_id)) > 0),
  CONSTRAINT users_username_not_blank CHECK (length(btrim(username::text)) >= 3),
  CONSTRAINT users_username_format CHECK (username::text ~ '^[A-Za-z0-9_][A-Za-z0-9_.-]{2,31}$'),
  CONSTRAINT users_email_not_blank CHECK (email IS NULL OR length(btrim(email::text)) > 3),
  CONSTRAINT users_password_hash_not_blank CHECK (length(btrim(password_hash)) > 0),
  CONSTRAINT users_timezone_not_blank CHECK (length(btrim(timezone)) > 0),
  CONSTRAINT users_disabled_state CHECK ((status = 'disabled') = (disabled_at IS NOT NULL)),
  CONSTRAINT users_weekly_work_minutes_positive CHECK (weekly_work_minutes IS NULL OR weekly_work_minutes > 0),
  CONSTRAINT users_weekly_work_minutes_state CHECK ((weekly_work_minutes IS NULL) = (weekly_work_minutes_set_at IS NULL))
);

CREATE TABLE system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_key_not_blank CHECK (length(btrim(key)) > 0)
);

INSERT INTO system_settings (key, value)
VALUES ('registration_enabled', 'true'::jsonb);

INSERT INTO users (username, name, display_name, password_hash, role, admin_approved, can_edit_sessions)
VALUES ('root', 'root', 'root', crypt('goodlife', gen_salt('bf', 12)), 'root', true, true)
ON CONFLICT (username) DO NOTHING;

CREATE TABLE user_managers (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manager_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, manager_user_id),
  CONSTRAINT user_managers_no_self_assignment CHECK (user_id <> manager_user_id)
);

CREATE INDEX user_managers_user_idx ON user_managers (user_id);
CREATE INDEX user_managers_manager_idx ON user_managers (manager_user_id);

CREATE TABLE administrative_requests (
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
  CONSTRAINT administrative_requests_decision_state CHECK ((status = 'pending') = (decided_at IS NULL)),
  CONSTRAINT administrative_requests_activity_change_payload CHECK (
    (request_type <> 'activity_change' and activity_change_action is null and activity_change_payload is null)
    or
    (request_type = 'activity_change' and activity_change_action in ('create', 'update', 'delete') and activity_change_payload is not null)
  )
);

ALTER TABLE administrative_requests
  ADD CONSTRAINT administrative_requests_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    (tstzrange(started_at, ended_at, '[)')) WITH &&
  )
  WHERE (deleted_at IS NULL);

CREATE INDEX administrative_requests_user_status_idx ON administrative_requests (user_id, status, started_at DESC);
CREATE INDEX administrative_requests_status_idx ON administrative_requests (status, started_at DESC);

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name citext NOT NULL,
  color text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_name_not_blank CHECK (length(btrim(name::text)) > 0),
  CONSTRAINT tags_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  UNIQUE (user_id, name)
);

CREATE UNIQUE INDEX tags_user_lower_name_idx ON tags (user_id, lower(name));
CREATE INDEX tags_user_id_idx ON tags (user_id);

INSERT INTO tags (user_id, name, color, is_default)
SELECT id, 'Presence', '#21A67A', true FROM users WHERE username = 'root'
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO tags (user_id, name, color, is_default)
SELECT id, 'Smart working', '#3B82F6', true FROM users WHERE username = 'root'
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO tags (user_id, name, color, is_default)
SELECT id, 'Not billable', '#8E8E93', true FROM users WHERE username = 'root'
ON CONFLICT (user_id, name) DO NOTHING;

CREATE TABLE default_tag_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name citext NOT NULL UNIQUE,
  color text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT default_tag_templates_name_not_blank CHECK (length(btrim(name::text)) > 0),
  CONSTRAINT default_tag_templates_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

INSERT INTO default_tag_templates (name, color, sort_order)
VALUES
  ('Presence', '#2563EB', 10),
  ('Smart working', '#16A34A', 20),
  ('Not billable', '#8E8E93', 30);

CREATE TABLE csv_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  filename text NOT NULL DEFAULT 'inline-upload.csv',
  file_sha256 text,
  row_count integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  imported_event_count integer NOT NULL DEFAULT 0,
  status csv_import_status NOT NULL DEFAULT 'uploaded',
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  imported_at timestamptz,
  CONSTRAINT csv_imports_filename_not_blank CHECK (length(btrim(filename)) > 0),
  CONSTRAINT csv_imports_sha256_hex CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT csv_imports_row_counts_non_negative CHECK (
    row_count >= 0 AND valid_rows >= 0 AND invalid_rows >= 0 AND imported_rows >= 0 AND imported_event_count >= 0
  )
);

CREATE INDEX csv_imports_user_created_idx ON csv_imports (user_id, created_at DESC);
CREATE INDEX csv_imports_status_idx ON csv_imports (status);

CREATE TABLE csv_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  csv_import_id uuid NOT NULL REFERENCES csv_imports(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_payload jsonb NOT NULL,
  is_valid boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT csv_import_rows_row_number_positive CHECK (row_number > 0),
  UNIQUE (csv_import_id, row_number)
);

CREATE INDEX csv_import_rows_import_valid_idx ON csv_import_rows (csv_import_id, is_valid);

CREATE TABLE time_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  status work_session_status NOT NULL DEFAULT 'open',
  source time_event_source NOT NULL DEFAULT 'manual',
  start_timezone text NOT NULL DEFAULT 'UTC',
  end_timezone text,
  note text,
  no_count_minutes integer NOT NULL DEFAULT 0,
  anomaly_reason text,
  csv_import_id uuid REFERENCES csv_imports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_sessions_start_timezone_not_blank CHECK (length(btrim(start_timezone)) > 0),
  CONSTRAINT time_sessions_end_timezone_not_blank CHECK (end_timezone IS NULL OR length(btrim(end_timezone)) > 0),
  CONSTRAINT time_sessions_end_after_start CHECK (ended_at IS NULL OR ended_at > started_at),
  CONSTRAINT time_sessions_no_count_non_negative CHECK (no_count_minutes >= 0),
  CONSTRAINT time_sessions_no_count_within_duration CHECK (
    ended_at IS NULL OR no_count_minutes <= floor(extract(epoch from (ended_at - started_at)) / 60)::integer
  ),
  CONSTRAINT time_sessions_import_source_has_import CHECK (source <> 'csv_import' OR csv_import_id IS NOT NULL)
);

CREATE UNIQUE INDEX one_active_session_per_user ON time_sessions (user_id) WHERE ended_at IS NULL;
CREATE INDEX time_sessions_user_started_idx ON time_sessions (user_id, started_at DESC);
CREATE INDEX time_sessions_user_ended_idx ON time_sessions (user_id, ended_at DESC) WHERE ended_at IS NOT NULL;

ALTER TABLE time_sessions
  ADD CONSTRAINT time_sessions_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    (tstzrange(started_at, COALESCE(ended_at, 'infinity'::timestamptz), '[)')) WITH &&
  );

CREATE TABLE session_tags (
  session_id uuid NOT NULL REFERENCES time_sessions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, tag_id)
);

CREATE INDEX session_tags_tag_idx ON session_tags (tag_id);

CREATE TABLE time_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES time_sessions(id) ON DELETE CASCADE,
  event_type time_event_type NOT NULL,
  occurred_at timestamptz NOT NULL,
  source time_event_source NOT NULL DEFAULT 'manual',
  timezone text NOT NULL DEFAULT 'UTC',
  client_timezone text GENERATED ALWAYS AS (timezone) STORED,
  client_submitted_at timestamptz NOT NULL DEFAULT now(),
  note text,
  change_reason text,
  csv_import_id uuid REFERENCES csv_imports(id) ON DELETE SET NULL,
  csv_import_row_id uuid REFERENCES csv_import_rows(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_events_client_timezone_not_blank CHECK (length(btrim(client_timezone)) > 0),
  CONSTRAINT time_events_import_source_has_import CHECK (source <> 'csv_import' OR csv_import_id IS NOT NULL),
  CONSTRAINT time_events_manual_edit_has_reason CHECK (
    source <> 'manual_edit' OR length(btrim(COALESCE(change_reason, ''))) > 0
  )
);

CREATE INDEX time_events_user_time_idx ON time_events (user_id, occurred_at DESC);
CREATE INDEX time_events_session_time_idx ON time_events (session_id, occurred_at);
CREATE INDEX time_events_type_time_idx ON time_events (event_type, occurred_at DESC);
CREATE INDEX time_events_import_idx ON time_events (csv_import_id) WHERE csv_import_id IS NOT NULL;

CREATE TABLE time_event_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_event_id uuid NOT NULL REFERENCES time_events(id) ON DELETE CASCADE,
  changed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  previous_event_type time_event_type NOT NULL,
  previous_occurred_at timestamptz NOT NULL,
  previous_client_timezone text NOT NULL,
  new_event_type time_event_type NOT NULL,
  new_occurred_at timestamptz NOT NULL,
  new_client_timezone text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_event_revisions_reason_not_blank CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX time_event_revisions_event_idx ON time_event_revisions (time_event_id, created_at DESC);

CREATE TABLE app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token_hash text,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT app_sessions_token_hash_not_blank CHECK (length(btrim(token_hash)) > 0),
  CONSTRAINT app_sessions_csrf_hash_not_blank CHECK (csrf_token_hash IS NULL OR length(btrim(csrf_token_hash)) > 0),
  CONSTRAINT app_sessions_expiry_after_created CHECK (expires_at > created_at),
  CONSTRAINT app_sessions_revoked_after_created CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX app_sessions_user_active_idx ON app_sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX app_sessions_expires_idx ON app_sessions (expires_at);

CREATE TABLE overtime_payments (
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

CREATE INDEX overtime_payments_user_week_idx ON overtime_payments (user_id, week_start DESC);

CREATE TABLE user_totp_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Authenticator app',
  secret_ciphertext bytea NOT NULL,
  secret_nonce bytea NOT NULL,
  secret_key_id text NOT NULL,
  algorithm text NOT NULL DEFAULT 'SHA1',
  digits integer NOT NULL DEFAULT 6,
  period_seconds integer NOT NULL DEFAULT 30,
  is_verified boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_totp_factors_algorithm_supported CHECK (algorithm IN ('SHA1', 'SHA256', 'SHA512')),
  CONSTRAINT user_totp_factors_digits_supported CHECK (digits IN (6, 8)),
  CONSTRAINT user_totp_factors_period_positive CHECK (period_seconds > 0),
  CONSTRAINT user_totp_factors_enabled_verified CHECK (enabled_at IS NULL OR is_verified)
);

CREATE UNIQUE INDEX user_totp_one_active_idx ON user_totp_factors (user_id) WHERE enabled_at IS NOT NULL;

CREATE TABLE passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  public_key_cose bytea,
  aaguid uuid,
  counter bigint NOT NULL DEFAULT 0,
  device_name text NOT NULL DEFAULT 'Passkey',
  name text GENERATED ALWAYS AS (device_name) STORED,
  transports text[] NOT NULL DEFAULT ARRAY[]::text[],
  backup_eligible boolean,
  backup_state boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT passkeys_credential_id_not_blank CHECK (length(btrim(credential_id)) > 0),
  CONSTRAINT passkeys_public_key_not_blank CHECK (length(btrim(public_key)) > 0),
  CONSTRAINT passkeys_device_name_not_blank CHECK (length(btrim(device_name)) > 0),
  CONSTRAINT passkeys_counter_non_negative CHECK (counter >= 0)
);

CREATE INDEX passkeys_user_idx ON passkeys (user_id, created_at DESC);

CREATE TABLE webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge text NOT NULL,
  challenge_hash text,
  type auth_challenge_type NOT NULL,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  CONSTRAINT webauthn_challenges_challenge_not_blank CHECK (length(btrim(challenge)) > 0),
  CONSTRAINT webauthn_challenges_expiry_after_created CHECK (expires_at > created_at),
  CONSTRAINT webauthn_challenges_consumed_after_created CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX webauthn_challenges_user_type_idx ON webauthn_challenges (user_id, type, expires_at DESC);
CREATE INDEX webauthn_challenges_expires_idx ON webauthn_challenges (expires_at);
CREATE UNIQUE INDEX webauthn_challenges_hash_idx ON webauthn_challenges (challenge_hash) WHERE challenge_hash IS NOT NULL;

CREATE TABLE passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_hash text NOT NULL,
  type text NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX passkey_challenges_user_id_idx ON passkey_challenges (user_id);
CREATE INDEX passkey_challenges_hash_idx ON passkey_challenges (challenge_hash);

CREATE TABLE recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  generated_batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  CONSTRAINT recovery_codes_hash_not_blank CHECK (length(btrim(code_hash)) > 0),
  UNIQUE (user_id, code_hash)
);

CREATE INDEX recovery_codes_user_unused_idx ON recovery_codes (user_id, created_at DESC) WHERE used_at IS NULL;

CREATE TABLE auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  identifier_hash text NOT NULL,
  ip_address inet,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_rate_limits_attempts_non_negative CHECK (attempts >= 0),
  UNIQUE (action, identifier_hash, window_started_at)
);

CREATE INDEX auth_rate_limits_blocked_idx ON auth_rate_limits (blocked_until) WHERE blocked_until IS NOT NULL;

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_event_type_not_blank CHECK (length(btrim(event_type)) > 0)
);

CREATE INDEX audit_logs_user_created_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX audit_logs_actor_created_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_event_created_idx ON audit_logs (event_type, created_at DESC);

CREATE VIEW audit_events AS SELECT * FROM audit_logs;

CREATE TABLE countdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES time_sessions(id) ON DELETE SET NULL,
  title text NOT NULL,
  target_time time NOT NULL,
  target_timezone text NOT NULL,
  target_at timestamptz,
  recurrence_rule text,
  status countdown_status NOT NULL DEFAULT 'active',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT countdowns_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT countdowns_timezone_not_blank CHECK (length(btrim(target_timezone)) > 0),
  CONSTRAINT countdowns_completion_status CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX countdowns_user_status_idx ON countdowns (user_id, status, target_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_user_names_and_state()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.display_name = '' AND NEW.name <> '' THEN
    NEW.display_name = NEW.name;
  ELSIF NEW.name = '' AND NEW.display_name <> '' THEN
    NEW.name = NEW.display_name;
  END IF;
  IF NEW.disabled_at IS NOT NULL THEN
    NEW.status = 'disabled';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_sync_before_write BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION sync_user_names_and_state();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tags_set_updated_at BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER time_sessions_set_updated_at BEFORE UPDATE ON time_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_totp_factors_set_updated_at BEFORE UPDATE ON user_totp_factors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER passkeys_set_updated_at BEFORE UPDATE ON passkeys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER countdowns_set_updated_at BEFORE UPDATE ON countdowns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER administrative_requests_set_updated_at BEFORE UPDATE ON administrative_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION normalize_time_session_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ended_at IS NULL AND NEW.status <> 'anomalous' THEN
    NEW.status = 'open';
  ELSIF NEW.ended_at IS NOT NULL AND NEW.status = 'open' THEN
    NEW.status = 'closed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER time_sessions_normalize_status BEFORE INSERT OR UPDATE ON time_sessions
  FOR EACH ROW EXECUTE FUNCTION normalize_time_session_status();

CREATE OR REPLACE FUNCTION enforce_session_tag_ownership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  session_owner uuid;
  tag_owner uuid;
BEGIN
  SELECT user_id INTO session_owner FROM time_sessions WHERE id = NEW.session_id;
  SELECT user_id INTO tag_owner FROM tags WHERE id = NEW.tag_id;
  IF session_owner IS NULL OR tag_owner IS NULL OR tag_owner <> session_owner THEN
    RAISE EXCEPTION 'tag must belong to the same user as the work session';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER session_tags_enforce_ownership BEFORE INSERT OR UPDATE ON session_tags
  FOR EACH ROW EXECUTE FUNCTION enforce_session_tag_ownership();

CREATE OR REPLACE FUNCTION enforce_time_event_session_ownership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  session_owner uuid;
BEGIN
  SELECT user_id INTO session_owner FROM time_sessions WHERE id = NEW.session_id;
  IF session_owner IS NULL OR NEW.user_id <> session_owner THEN
    RAISE EXCEPTION 'time event user_id must match work session owner';
  END IF;
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER time_events_enforce_session_ownership BEFORE INSERT OR UPDATE ON time_events
  FOR EACH ROW EXECUTE FUNCTION enforce_time_event_session_ownership();

CREATE VIEW session_report AS
SELECT
  s.user_id,
  date_trunc('day', s.started_at)::date AS day,
  t.name AS tag_name,
  t.color,
  sum(greatest(extract(epoch from (s.ended_at - s.started_at)) - s.no_count_minutes * 60, 0) / 60)::integer AS minutes
FROM time_sessions s
LEFT JOIN session_tags st ON st.session_id = s.id
LEFT JOIN tags t ON t.id = st.tag_id
WHERE s.ended_at IS NOT NULL
GROUP BY s.user_id, date_trunc('day', s.started_at)::date, t.name, t.color;
