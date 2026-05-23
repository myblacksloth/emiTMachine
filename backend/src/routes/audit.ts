import { Router, type Request } from "express";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import PDFDocument from "pdfkit";
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

// ---------------------------------------------------------------------------
// PDF work-report
// ---------------------------------------------------------------------------

const workReportSchema = z.object({
  userId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
})

interface SessionRow {
  id: string
  started_at: Date
  ended_at: Date | null
  no_count_minutes: number
  note: string | null
  status: string
  user_db_id: string
  username: string
  display_name: string | null
  name: string | null
  public_id: string
  email: string | null
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("it-IT")
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
}

function fmtDuration(startedAt: Date, endedAt: Date | null, noCountMinutes: number): string {
  if (endedAt === null) return "In corso"
  const totalMs = endedAt.getTime() - startedAt.getTime()
  const totalMinutes = Math.max(0, Math.floor(totalMs / 60000) - noCountMinutes)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${String(m).padStart(2, "0")}m`
}

function calcNetMinutes(startedAt: Date, endedAt: Date | null, noCountMinutes: number): number {
  if (endedAt === null) return 0
  const totalMs = endedAt.getTime() - startedAt.getTime()
  return Math.max(0, Math.floor(totalMs / 60000) - noCountMinutes)
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + "…"
}

// Column x-positions (A4 usable width = 495pt, left margin = 50)
const COL = {
  num:      { x: 50,  w: 25  },
  date:     { x: 75,  w: 65  },
  ingresso: { x: 140, w: 65  },
  uscita:   { x: 205, w: 65  },
  durata:   { x: 270, w: 55  },
  nocount:  { x: 325, w: 55  },
  note:     { x: 380, w: 165 }
}

const PAGE_BOTTOM = 792 - 50  // A4 height minus bottom margin
const ROW_HEIGHT  = 14

router.get("/work-report.pdf", async (req, res, next) => {
  try {
    requireRoot(req)

    const params = workReportSchema.parse(req.query)

    const dateToParam =
      params.dateTo != null
        ? /^\d{4}-\d{2}-\d{2}$/.test(params.dateTo)
          ? `${params.dateTo}T23:59:59.999Z`
          : params.dateTo
        : null

    const result = await pool.query<SessionRow>(
      `SELECT
         s.id,
         s.started_at,
         s.ended_at,
         s.no_count_minutes,
         s.note,
         s.status,
         u.id   AS user_db_id,
         u.username,
         u.display_name,
         u.name,
         u.public_id,
         u.email
       FROM time_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE
         ($1::uuid IS NULL OR s.user_id = $1::uuid)
         AND ($2::timestamptz IS NULL OR s.started_at >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR s.started_at <= $3::timestamptz)
       ORDER BY u.username ASC, s.started_at ASC`,
      [params.userId ?? null, params.dateFrom ?? null, dateToParam]
    )

    const sessions = result.rows

    // Stream the PDF directly to the response
    const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true })
    res.header("Content-Type", "application/pdf")
    res.header("Content-Disposition", `attachment; filename="registro-presenze.pdf"`)
    doc.pipe(res)

    // -----------------------------------------------------------------------
    // Helper: draw table header row
    // -----------------------------------------------------------------------
    function drawTableHeader(doc: InstanceType<typeof PDFDocument>, y: number): void {
      doc.font("Helvetica-Bold").fontSize(9)
      doc.fillColor("black")
      doc.text("#",          COL.num.x,      y, { width: COL.num.w,      lineBreak: false })
      doc.text("Data",       COL.date.x,     y, { width: COL.date.w,     lineBreak: false })
      doc.text("Ingresso",   COL.ingresso.x, y, { width: COL.ingresso.w, lineBreak: false })
      doc.text("Uscita",     COL.uscita.x,   y, { width: COL.uscita.w,   lineBreak: false })
      doc.text("Durata",     COL.durata.x,   y, { width: COL.durata.w,   lineBreak: false })
      doc.text("No Count",   COL.nocount.x,  y, { width: COL.nocount.w,  lineBreak: false })
      doc.text("Note",       COL.note.x,     y, { width: COL.note.w,     lineBreak: false })
      // underline
      const lineY = y + ROW_HEIGHT - 2
      doc.moveTo(50, lineY).lineTo(545, lineY).lineWidth(0.5).stroke()
    }

    // -----------------------------------------------------------------------
    // Helper: add page number footer
    // -----------------------------------------------------------------------
    let pageNumber = 1
    function addPageFooter(doc: InstanceType<typeof PDFDocument>): void {
      doc.font("Helvetica").fontSize(8).fillColor("#888888")
      doc.text(`Pagina ${pageNumber}`, 50, PAGE_BOTTOM - 5, { width: 495, align: "right" })
      doc.fillColor("black")
    }

    // -----------------------------------------------------------------------
    // Title / cover block
    // -----------------------------------------------------------------------
    let cursorY = 50

    doc.font("Helvetica-Bold").fontSize(16).fillColor("black")
    doc.text("REGISTRO PRESENZE LAVORATIVE", 50, cursorY, { width: 495, align: "center" })
    cursorY += 24

    doc.font("Helvetica").fontSize(10)
    const generatedOn = new Date().toLocaleDateString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric"
    })
    doc.text(`Generato il: ${generatedOn}`, 50, cursorY, { width: 495, align: "center" })
    cursorY += 14

    const periodoLabel =
      params.dateFrom != null || params.dateTo != null
        ? `${params.dateFrom ?? "—"} — ${params.dateTo ?? "—"}`
        : "Tutti i record"
    doc.text(`Periodo: ${periodoLabel}`, 50, cursorY, { width: 495, align: "center" })
    cursorY += 24

    // -----------------------------------------------------------------------
    // No records edge case
    // -----------------------------------------------------------------------
    if (sessions.length === 0) {
      doc.font("Helvetica").fontSize(11).fillColor("#444444")
      doc.text("Nessun record trovato nel periodo selezionato.", 50, cursorY, { width: 495, align: "center" })
      addPageFooter(doc)
      doc.end()
      return
    }

    // -----------------------------------------------------------------------
    // Group by user and render
    // -----------------------------------------------------------------------
    let totalSessions = 0
    let currentUserId: string | null = null
    let userNetMinutes = 0
    let userRowNum = 0
    let firstUser = true

    const flushUserTotals = (doc: InstanceType<typeof PDFDocument>, y: number): number => {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("black")
      const totalH = Math.floor(userNetMinutes / 60)
      const totalM = userNetMinutes % 60
      doc.text(
        `Totale ore lavorate: ${totalH} h ${String(totalM).padStart(2, "0")} min`,
        50,
        y,
        { width: 495 }
      )
      return y + 18
    }

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i]

      // ---- New user block ----
      if (s.user_db_id !== currentUserId) {
        // Flush previous user totals
        if (currentUserId !== null) {
          cursorY = flushUserTotals(doc, cursorY)
          cursorY += 10
        }

        currentUserId = s.user_db_id
        userNetMinutes = 0
        userRowNum = 0

        // Ensure there is room for the user header + table header
        if (!firstUser && cursorY > PAGE_BOTTOM - 60) {
          addPageFooter(doc)
          doc.addPage()
          pageNumber++
          cursorY = 50
        }
        firstUser = false

        // Separator line
        if (cursorY > 70) {
          doc.moveTo(50, cursorY).lineTo(545, cursorY).lineWidth(0.3).strokeColor("#cccccc").stroke()
          doc.strokeColor("black")
          cursorY += 8
        }

        // User block header
        const displayName = s.display_name ?? s.name ?? s.username
        doc.font("Helvetica-Bold").fontSize(12).fillColor("black")
        doc.text(`Dipendente: ${displayName}`, 50, cursorY, { width: 495 })
        cursorY += 16

        doc.font("Helvetica").fontSize(10).fillColor("#333333")
        doc.text(`Identificativo: ${s.public_id}`, 50, cursorY, { width: 247, lineBreak: false })
        doc.text(`Email: ${s.email ?? "—"}`, 297, cursorY, { width: 248, lineBreak: false })
        cursorY += 16

        doc.fillColor("black")
        drawTableHeader(doc, cursorY)
        cursorY += ROW_HEIGHT + 2
      }

      // ---- New page if needed ----
      if (cursorY + ROW_HEIGHT > PAGE_BOTTOM - 20) {
        addPageFooter(doc)
        doc.addPage()
        pageNumber++
        cursorY = 50
        // Repeat table header on continuation page
        const displayName = s.display_name ?? s.name ?? s.username
        doc.font("Helvetica-Bold").fontSize(10).fillColor("black")
        doc.text(`(cont.) Dipendente: ${displayName}`, 50, cursorY, { width: 495 })
        cursorY += 14
        drawTableHeader(doc, cursorY)
        cursorY += ROW_HEIGHT + 2
      }

      // ---- Data row ----
      userRowNum++
      totalSessions++
      const netMin = calcNetMinutes(s.started_at, s.ended_at, s.no_count_minutes)
      userNetMinutes += netMin

      // Alternating row background
      if (userRowNum % 2 === 0) {
        doc.rect(50, cursorY - 1, 495, ROW_HEIGHT).fill("#f5f5f5")
        doc.fillColor("black")
      }

      const startedAt = s.started_at instanceof Date ? s.started_at : new Date(s.started_at)
      const endedAt   = s.ended_at != null
        ? (s.ended_at instanceof Date ? s.ended_at : new Date(s.ended_at))
        : null

      doc.font("Helvetica").fontSize(9).fillColor("black")
      doc.text(String(userRowNum),                     COL.num.x,      cursorY, { width: COL.num.w,      lineBreak: false })
      doc.text(fmtDate(startedAt),                     COL.date.x,     cursorY, { width: COL.date.w,     lineBreak: false })
      doc.text(fmtTime(startedAt),                     COL.ingresso.x, cursorY, { width: COL.ingresso.w, lineBreak: false })
      doc.text(endedAt != null ? fmtTime(endedAt) : "—", COL.uscita.x, cursorY, { width: COL.uscita.w,  lineBreak: false })
      doc.text(fmtDuration(startedAt, endedAt, s.no_count_minutes), COL.durata.x, cursorY, { width: COL.durata.w, lineBreak: false })
      doc.text(s.no_count_minutes > 0 ? `${s.no_count_minutes}m` : "—", COL.nocount.x, cursorY, { width: COL.nocount.w, lineBreak: false })
      doc.text(truncate(s.note ?? "", 40),             COL.note.x,     cursorY, { width: COL.note.w,     lineBreak: false })

      cursorY += ROW_HEIGHT
    }

    // Flush last user totals
    if (currentUserId !== null) {
      cursorY += 4
      cursorY = flushUserTotals(doc, cursorY)
    }

    // -----------------------------------------------------------------------
    // Grand total footer
    // -----------------------------------------------------------------------
    cursorY += 12
    if (cursorY > PAGE_BOTTOM - 30) {
      addPageFooter(doc)
      doc.addPage()
      pageNumber++
      cursorY = 50
    }
    doc.moveTo(50, cursorY).lineTo(545, cursorY).lineWidth(0.5).strokeColor("#333333").stroke()
    doc.strokeColor("black")
    cursorY += 8
    doc.font("Helvetica-Bold").fontSize(10).fillColor("black")
    doc.text(`Totale sessioni: ${totalSessions}`, 50, cursorY, { width: 495 })

    addPageFooter(doc)
    doc.end()

    req.log?.info("work-report PDF generated", {
      actorUserId: req.user!.id,
      sessions: totalSessions,
      filters: params
    })
  } catch (error) {
    next(error)
  }
})

export default router
