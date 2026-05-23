-- Migration: 20260523_audit_log
-- Replaces the provisional audit_logs table (text event_type, severity, actor_user_id)
-- with a properly typed table backed by an ENUM and aligned with the UI filter axes.

-- 1. Drop the thin compatibility view introduced alongside the old table.
DROP VIEW IF EXISTS audit_events;

-- 2. Drop the old table (and its indexes, which are owned by the table).
DROP TABLE IF EXISTS audit_logs;

-- 3. Create the canonical ENUM for every auditable event type.
CREATE TYPE audit_event_type AS ENUM (
  'login',
  'logout',
  'password_change',
  'totp_setup',
  'totp_reset',
  'passkey_added',
  'passkey_removed',
  'manual_clock_in',
  'manual_clock_out',
  'activity_created',
  'activity_updated',
  'activity_deleted',
  'csv_exported',
  'csv_imported',
  'overtime_target_set',
  'overtime_paid',
  'overtime_paid_revoked',
  'recovery_code_used',
  'password_recovery'
);

-- 4. Recreate audit_logs with the full schema.
--    user_id  : the actor (who performed the action). Nullable so rows survive user deletion.
--    target_user_id : the subject of the action (e.g. admin resetting another user's password).
CREATE TABLE audit_logs (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid              REFERENCES users(id) ON DELETE SET NULL,
  target_user_id   uuid              REFERENCES users(id) ON DELETE SET NULL,
  event_type       audit_event_type  NOT NULL,
  ip_address       inet,
  user_agent       text,
  metadata         jsonb,
  created_at       timestamptz       NOT NULL DEFAULT now()
);

-- 5. Indexes covering the four primary filter axes used by the audit UI.
CREATE INDEX audit_logs_user_id_idx        ON audit_logs (user_id,        created_at DESC);
CREATE INDEX audit_logs_target_user_id_idx ON audit_logs (target_user_id, created_at DESC);
CREATE INDEX audit_logs_event_type_idx     ON audit_logs (event_type,     created_at DESC);
CREATE INDEX audit_logs_created_at_idx     ON audit_logs (created_at DESC);
