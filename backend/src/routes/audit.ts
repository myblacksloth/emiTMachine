import { Router, type Request } from "express";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuditEventType } from "../services/audit.js";

const router = Router()

router.use(requireAuth)

function requireRoot(req: Request) {
  if (!req.user || req.user.role !== "root") {
    throw new HttpError(403, "Root access required")
  }
}

const auditEventTypes: AuditEventType[] = [
  "login",
  "logout",
  "password_change",
  "totp_setup",
  "totp_reset",
  "passkey_added",
  "passkey_removed",
  "manual_clock_in",
  "manual_clock_out",
  "activity_created",
  "activity_updated",
  "activity_deleted",
  "csv_exported",
  "csv_imported",
  "overtime_target_set",
  "overtime_paid",
  "overtime_paid_revoked",
  "recovery_code_used",
  "password_recovery"
]

const filterSchema = z.object({
  userId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  eventType: z.enum(auditEventTypes as [AuditEventType, ...AuditEventType[]]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
})

const listSchema = filterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

function buildWhere(params: {
  userId?: string
  targetUserId?: string
  eventType?: string
  dateFrom?: string
  dateTo?: string
}) {
  const conditions: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (params.userId) {
    conditions.push(`al.user_id = $${idx++}`)
    values.push(params.userId)
  }
  if (params.targetUserId) {
    conditions.push(`al.target_user_id = $${idx++}`)
    values.push(params.targetUserId)
  }
  if (params.eventType) {
    conditions.push(`al.event_type = $${idx++}::audit_event_type`)
    values.push(params.eventType)
  }
  if (params.dateFrom) {
    conditions.push(`al.created_at >= $${idx++}`)
    values.push(params.dateFrom)
  }
  if (params.dateTo) {
    // treat dateTo as end of day when only a date is given (no time component)
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(params.dateTo)
    conditions.push(`al.created_at <= $${idx++}`)
    values.push(isDateOnly ? `${params.dateTo}T23:59:59.999Z` : params.dateTo)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  return { where, values, nextIdx: idx }
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    userUsername: row.user_username,
    targetUserId: row.target_user_id,
    targetUserUsername: row.target_user_username,
    eventType: row.event_type,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    metadata: row.metadata,
    createdAt: row.created_at
  }
}

const baseSelect = `
  SELECT al.id,
         al.user_id,
         actor.username AS user_username,
         al.target_user_id,
         target.username AS target_user_username,
         al.event_type,
         al.ip_address,
         al.user_agent,
         al.metadata,
         al.created_at
  FROM audit_logs al
  LEFT JOIN users actor ON actor.id = al.user_id
  LEFT JOIN users target ON target.id = al.target_user_id`

router.get("/", async (req, res, next) => {
  try {
    requireRoot(req)
    const query = listSchema.parse(req.query)
    const { where, values, nextIdx } = buildWhere(query)

    const offset = (query.page - 1) * query.limit

    const [logsResult, countResult] = await Promise.all([
      pool.query(
        `${baseSelect}
         ${where}
         ORDER BY al.created_at DESC
         LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
        [...values, query.limit, offset]
      ),
      pool.query(
        `SELECT count(*)::int AS total FROM audit_logs al ${where}`,
        values
      )
    ])

    res.json({
      logs: logsResult.rows.map(mapRow),
      total: countResult.rows[0]?.total ?? 0,
      page: query.page,
      limit: query.limit
    })
  } catch (error) {
    next(error)
  }
})

router.get("/export", async (req, res, next) => {
  try {
    requireRoot(req)
    const filters = filterSchema.parse(req.query)
    const { where, values } = buildWhere(filters)

    const result = await pool.query(
      `${baseSelect}
       ${where}
       ORDER BY al.created_at DESC`,
      values
    )

    const rows = result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id ?? "",
      user_username: row.user_username ?? "",
      target_user_id: row.target_user_id ?? "",
      target_user_username: row.target_user_username ?? "",
      event_type: row.event_type,
      ip_address: row.ip_address ?? "",
      user_agent: row.user_agent ?? "",
      metadata: row.metadata != null ? JSON.stringify(row.metadata) : "",
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
    }))

    const csv = stringify(rows, {
      header: true,
      columns: [
        "id",
        "user_id",
        "user_username",
        "target_user_id",
        "target_user_username",
        "event_type",
        "ip_address",
        "user_agent",
        "metadata",
        "created_at"
      ]
    })

    res.header("Content-Type", "text/csv; charset=utf-8")
    res.header("Content-Disposition", `attachment; filename="audit-log.csv"`)
    req.log?.info("audit log exported", { actorUserId: req.user!.id, rows: result.rowCount })
    res.send(csv)
  } catch (error) {
    next(error)
  }
})

export default router
