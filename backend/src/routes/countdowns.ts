import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { isoDateTimeSchema, uuidSchema } from "../utils/validators.js";

const router = Router();

const countdownCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  targetAt: isoDateTimeSchema,
  timezone: z.string().trim().min(1).max(80),
  linkToCurrentSession: z.boolean().optional().default(false)
});

const countdownStatusSchema = z.object({
  status: z.enum(["active", "completed", "cancelled"])
});

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `select id, title, target_at, target_timezone, session_id, status
       from countdowns
       where user_id = $1 and status = 'active'
       order by target_at nulls last, created_at desc`,
      [req.user!.id]
    );

    res.json({
      countdowns: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        targetAt: row.target_at,
        targetTimezone: row.target_timezone,
        linkedToCurrentSession: Boolean(row.session_id),
        status: row.status
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = countdownCreateSchema.parse(req.body);
    const targetAt = new Date(input.targetAt);

    if (targetAt.getTime() <= Date.now()) {
      throw new HttpError(400, "Countdown target must be in the future");
    }

    const countdown = await withTransaction(async (client) => {
      let sessionId: string | null = null;
      if (input.linkToCurrentSession) {
        const session = await client.query(
          "select id from time_sessions where user_id = $1 and ended_at is null order by started_at desc limit 1",
          [req.user!.id]
        );
        sessionId = session.rows[0]?.id ?? null;
      }

      const result = await client.query(
        `insert into countdowns (user_id, session_id, title, target_time, target_timezone, target_at)
         values ($1, $2, $3, $4::timestamptz::time, $5, $4::timestamptz)
         returning id, title, target_at, target_timezone, session_id, status`,
        [req.user!.id, sessionId, input.title, targetAt, input.timezone]
      );

      return result.rows[0];
    });

    req.log?.info("countdown created", { userId: req.user!.id, countdownId: countdown.id });
    res.status(201).json({
      countdown: {
        id: countdown.id,
        title: countdown.title,
        targetAt: countdown.target_at,
        targetTimezone: countdown.target_timezone,
        linkedToCurrentSession: Boolean(countdown.session_id),
        status: countdown.status
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const countdownId = uuidSchema.parse(req.params.id);
    const input = countdownStatusSchema.parse(req.body);

    const result = await pool.query(
      `update countdowns
       set status = $3::countdown_status,
           completed_at = case when $3::countdown_status = 'completed' then now() else null end
       where id = $1 and user_id = $2
       returning id`,
      [countdownId, req.user!.id, input.status]
    );
    if (!result.rows[0]) {
      throw new HttpError(404, "Countdown not found");
    }

    req.log?.info("countdown status updated", { userId: req.user!.id, countdownId, status: input.status });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const countdownId = uuidSchema.parse(req.params.id);
    const result = await pool.query(
      "update countdowns set status = 'cancelled', completed_at = null where id = $1 and user_id = $2 returning id",
      [countdownId, req.user!.id]
    );
    if (!result.rows[0]) {
      throw new HttpError(404, "Countdown not found");
    }

    req.log?.info("countdown cancelled", { userId: req.user!.id, countdownId });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
