import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { assertUserTags } from "../services/tags.js";
import { isoDateTimeSchema, uuidSchema } from "../utils/validators.js";

const router = Router();

const punchInSchema = z.object({
  occurredAt: isoDateTimeSchema,
  timezone: z.string().trim().min(1).max(80),
  tagIds: z.array(uuidSchema).min(1).max(10),
  note: z.string().trim().max(1000).optional()
});

const punchOutSchema = z.object({
  occurredAt: isoDateTimeSchema,
  timezone: z.string().trim().min(1).max(80),
  note: z.string().trim().max(1000).optional()
});

function ensureReasonableClientTime(value: string) {
  const occurredAt = new Date(value);
  const now = Date.now();
  const maxFutureMs = 5 * 60 * 1000;
  if (occurredAt.getTime() > now + maxFutureMs) {
    throw new HttpError(400, "Punch time cannot be more than five minutes in the future");
  }
  return occurredAt;
}

router.use(requireAuth);

router.get("/status", async (req, res, next) => {
  try {
    const result = await pool.query(
      `select s.id, s.started_at, s.start_timezone, s.note,
              coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) filter (where t.id is not null), '[]') as tags
       from time_sessions s
       left join session_tags st on st.session_id = s.id
       left join tags t on t.id = st.tag_id
       where s.user_id = $1 and s.ended_at is null
       group by s.id`,
      [req.user!.id]
    );
    res.json({ activeSession: result.rows[0] ?? null });
  } catch (error) {
    next(error);
  }
});

router.post("/in", async (req, res, next) => {
  try {
    const input = punchInSchema.parse(req.body);
    const occurredAt = ensureReasonableClientTime(input.occurredAt);

    const session = await withTransaction(async (client) => {
      const open = await client.query("select id from time_sessions where user_id = $1 and ended_at is null for update", [req.user!.id]);
      if (open.rows[0]) {
        throw new HttpError(409, "A work session is already open");
      }

      await assertUserTags(client, req.user!.id, input.tagIds);

      const sessionResult = await client.query(
        `insert into time_sessions (user_id, started_at, start_timezone, note)
         values ($1, $2, $3, $4)
         returning id, started_at, start_timezone, note`,
        [req.user!.id, occurredAt, input.timezone, input.note ?? null]
      );

      const sessionId = sessionResult.rows[0].id;
      await client.query(
        `insert into time_events (user_id, session_id, event_type, occurred_at, timezone, note)
         values ($1, $2, 'clock_in', $3, $4, $5)`,
        [req.user!.id, sessionId, occurredAt, input.timezone, input.note ?? null]
      );

      for (const tagId of input.tagIds) {
        await client.query("insert into session_tags (session_id, tag_id) values ($1, $2)", [sessionId, tagId]);
      }

      return sessionResult.rows[0];
    });

    res.status(201).json({ session });
  } catch (error) {
    next(error);
  }
});

router.post("/out", async (req, res, next) => {
  try {
    const input = punchOutSchema.parse(req.body);
    const occurredAt = ensureReasonableClientTime(input.occurredAt);

    const session = await withTransaction(async (client) => {
      const open = await client.query(
        "select id, started_at from time_sessions where user_id = $1 and ended_at is null for update",
        [req.user!.id]
      );
      const current = open.rows[0];
      if (!current) {
        throw new HttpError(409, "No work session is currently open");
      }
      if (occurredAt <= new Date(current.started_at)) {
        throw new HttpError(400, "Clock out time must be after clock in time");
      }

      await client.query(
        `insert into time_events (user_id, session_id, event_type, occurred_at, timezone, note)
         values ($1, $2, 'clock_out', $3, $4, $5)`,
        [req.user!.id, current.id, occurredAt, input.timezone, input.note ?? null]
      );

      const sessionResult = await client.query(
        `update time_sessions
         set ended_at = $3, end_timezone = $4, note = coalesce($5, note), updated_at = now()
         where id = $1 and user_id = $2
         returning id, started_at, ended_at, start_timezone, end_timezone, note`,
        [current.id, req.user!.id, occurredAt, input.timezone, input.note ?? null]
      );

      return sessionResult.rows[0];
    });

    res.json({ session });
  } catch (error) {
    next(error);
  }
});

export default router;
