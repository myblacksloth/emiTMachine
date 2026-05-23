import { pool } from "../db.js"
import { logger } from "../utils/logger.js"
import type { PoolClient } from "pg"

export type AuditEventType =
  | "login"
  | "logout"
  | "password_change"
  | "totp_setup"
  | "totp_reset"
  | "passkey_added"
  | "passkey_removed"
  | "manual_clock_in"
  | "manual_clock_out"
  | "activity_created"
  | "activity_updated"
  | "activity_deleted"
  | "csv_exported"
  | "csv_imported"
  | "overtime_target_set"
  | "overtime_paid"
  | "overtime_paid_revoked"
  | "recovery_code_used"
  | "password_recovery"

export async function logAudit(params: {
  userId: string | null
  targetUserId?: string | null
  eventType: AuditEventType
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
  client?: PoolClient
}): Promise<void> {
  try {
    const executor = params.client ?? pool
    await executor.query(
      `insert into audit_logs (user_id, target_user_id, event_type, ip_address, user_agent, metadata)
       values ($1, $2, $3, $4::inet, $5, $6::jsonb)`,
      [
        params.userId ?? null,
        params.targetUserId ?? null,
        params.eventType,
        params.ipAddress ?? null,
        params.userAgent ?? null,
        params.metadata ? JSON.stringify(params.metadata) : null
      ]
    )
  } catch (error) {
    logger.error("audit log write failed", { eventType: params.eventType, userId: params.userId, error })
  }
}
