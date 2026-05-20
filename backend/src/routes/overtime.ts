import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const weeklyTargetSchema = z.object({
  weeklyWorkMinutes: z.number().int().min(60).max(10080)
});

const dateOnlySchema = z.string().transform((value) => value.slice(0, 10)).pipe(z.string().date());

const paymentSchema = z.object({
  weekStart: dateOnlySchema
});

function mapSettings(row: {
  overtime_enabled: boolean;
  overtime_mode: "overtime" | "time_bank";
  weekly_work_minutes: number | null;
  weekly_work_minutes_set_at: string | null;
}) {
  return {
    enabled: row.overtime_enabled,
    mode: row.overtime_mode,
    weeklyWorkMinutes: row.weekly_work_minutes,
    weeklyWorkMinutesSetAt: row.weekly_work_minutes_set_at
  };
}

export async function getOvertimeReport(userId: string) {
  const userResult = await pool.query(
    `select overtime_enabled, overtime_mode, weekly_work_minutes, weekly_work_minutes_set_at
     from users
     where id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    throw new HttpError(404, "User not found");
  }

  if (!user.overtime_enabled || !user.weekly_work_minutes || !user.weekly_work_minutes_set_at) {
    return {
      settings: mapSettings(user),
      residualMinutes: 0,
      weeks: []
    };
  }

  const result = await pool.query(
     `with user_settings as (
       select id, timezone, overtime_mode, weekly_work_minutes, weekly_work_minutes_set_at,
              date_trunc('week', now() at time zone timezone)::date as current_week
       from users
       where id = $1
     ),
     worked as (
       select date_trunc('week', s.started_at at time zone us.timezone)::date as week_start,
              coalesce(sum(extract(epoch from (s.ended_at - s.started_at)) / 60), 0)::integer as worked_minutes
       from time_sessions s
       join user_settings us on us.id = s.user_id
       where s.user_id = $1
         and s.ended_at is not null
       group by date_trunc('week', s.started_at at time zone us.timezone)::date
     ),
     weeks as (
       select current_week as week_start from user_settings
       union
       select week_start from worked
     )
     select to_char(w.week_start, 'YYYY-MM-DD') as week_start,
            coalesce(worked.worked_minutes, 0)::integer as worked_minutes,
            us.weekly_work_minutes::integer as target_minutes,
            (coalesce(worked.worked_minutes, 0) - us.weekly_work_minutes)::integer as delta_minutes,
            greatest(coalesce(worked.worked_minutes, 0) - us.weekly_work_minutes, 0)::integer as overtime_minutes,
            (w.week_start < us.current_week) as is_closed,
            op.paid_at,
            us.overtime_mode
     from weeks w
     cross join user_settings us
     left join worked on worked.week_start = w.week_start
     left join overtime_payments op on op.user_id = us.id and op.week_start = w.week_start
     order by w.week_start desc`,
    [userId]
  );

  const weeks = result.rows.map((row) => ({
    weekStart: row.week_start,
    workedMinutes: Number(row.worked_minutes),
    targetMinutes: Number(row.target_minutes),
    deltaMinutes: Number(row.delta_minutes),
    overtimeMinutes: Number(row.overtime_minutes),
    isClosed: Boolean(row.is_closed),
    paidAt: row.paid_at ?? null
  }));

  const residualMinutes =
    user.overtime_mode === "time_bank"
      ? weeks.filter((week) => week.isClosed).reduce((total, week) => total + week.deltaMinutes, 0)
      : 0;

  return {
    settings: mapSettings(user),
    residualMinutes,
    weeks
  };
}

router.get("/", async (req, res, next) => {
  try {
    res.json(await getOvertimeReport(req.user!.id));
  } catch (error) {
    next(error);
  }
});

router.post("/weekly-target", async (req, res, next) => {
  try {
    const input = weeklyTargetSchema.parse(req.body);
    const result = await pool.query(
      `update users
       set weekly_work_minutes = $2, weekly_work_minutes_set_at = now(), updated_at = now()
       where id = $1
         and overtime_enabled = true
         and weekly_work_minutes is null
       returning id`,
      [req.user!.id, input.weeklyWorkMinutes]
    );
    if (!result.rows[0]) {
      throw new HttpError(409, "Weekly target is disabled or has already been set");
    }

    req.log?.info("overtime weekly target set", { userId: req.user!.id, weeklyWorkMinutes: input.weeklyWorkMinutes });
    res.status(201).json(await getOvertimeReport(req.user!.id));
  } catch (error) {
    next(error);
  }
});

router.post("/payments", async (req, res, next) => {
  try {
    const input = paymentSchema.parse(req.body);
    const report = await getOvertimeReport(req.user!.id);
    if (!report.settings.enabled || report.settings.mode !== "overtime") {
      throw new HttpError(400, "Payment status is available only in overtime mode");
    }
    const week = report.weeks.find((item) => item.weekStart === input.weekStart);
    if (!week || !week.isClosed || week.overtimeMinutes <= 0) {
      throw new HttpError(400, "Only closed weeks with overtime can be marked as paid");
    }
    if (week.paidAt) {
      throw new HttpError(409, "This week is already marked as paid");
    }

    await pool.query(
      `insert into overtime_payments (user_id, week_start, overtime_minutes, paid_by_user_id)
       values ($1, $2, $3, $1)`,
      [req.user!.id, input.weekStart, week.overtimeMinutes]
    );

    req.log?.info("overtime payment marked", { userId: req.user!.id, weekStart: input.weekStart, overtimeMinutes: week.overtimeMinutes });
    res.status(201).json(await getOvertimeReport(req.user!.id));
  } catch (error) {
    next(error);
  }
});

export default router;
