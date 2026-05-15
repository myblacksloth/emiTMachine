import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { assertUserTags } from "../services/tags.js";
import { isoDateTimeSchema, paginationSchema, uuidSchema } from "../utils/validators.js";

const router = Router();

router.use(requireAuth);

const sessionUpdateSchema = z.object({
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable().optional(),
  startTimezone: z.string().trim().min(1).max(80),
  endTimezone: z.string().trim().min(1).max(80).nullable().optional(),
  note: z.string().trim().max(1000).optional(),
  tagIds: z.array(uuidSchema).min(1).max(10),
  reason: z.string().trim().min(3).max(500)
});

function assertActivityEditEnabled() {
  // Activity editing is enabled by default for the owning user.
  // Future admin-controlled access should be enforced here by checking a
  // per-user permission flag before allowing update/delete operations.
  return true;
}

router.get("/summary", async (req, res, next) => {
  try {
    const query = paginationSchema.parse(req.query);
    const params: unknown[] = [req.user!.id, query.from ?? null, query.to ?? null, query.tagId ?? null];

    const sessions = await pool.query(
      `with filtered as (
         select s.id, s.started_at, s.ended_at,
                extract(epoch from (s.ended_at - s.started_at))::bigint as duration_seconds
         from time_sessions s
         left join session_tags st on st.session_id = s.id
         where s.user_id = $1
           and s.ended_at is not null
           and ($2::timestamptz is null or s.started_at >= $2::timestamptz)
           and ($3::timestamptz is null or s.started_at <= $3::timestamptz)
           and ($4::uuid is null or st.tag_id = $4::uuid)
         group by s.id
       )
       select count(*)::int as sessions,
              coalesce(sum(duration_seconds), 0)::bigint as total_seconds,
              coalesce(avg(duration_seconds), 0)::bigint as average_session_seconds,
              count(distinct started_at::date)::int as days_worked
       from filtered`,
      params
    );

    const buckets = await pool.query(
      `with filtered as (
         select distinct s.id, s.started_at, s.ended_at,
                extract(epoch from (s.ended_at - s.started_at))::bigint as duration_seconds
         from time_sessions s
         left join session_tags st on st.session_id = s.id
         where s.user_id = $1
           and s.ended_at is not null
           and ($2::timestamptz is null or s.started_at >= $2::timestamptz)
           and ($3::timestamptz is null or s.started_at <= $3::timestamptz)
           and ($4::uuid is null or st.tag_id = $4::uuid)
       )
       select 'day' as bucket_type, date_trunc('day', started_at) as bucket_start, sum(duration_seconds)::bigint as total_seconds
       from filtered group by bucket_start
       union all
       select 'week', date_trunc('week', started_at), sum(duration_seconds)::bigint
       from filtered group by date_trunc('week', started_at)
       union all
       select 'month', date_trunc('month', started_at), sum(duration_seconds)::bigint
       from filtered group by date_trunc('month', started_at)
       order by bucket_type, bucket_start`,
      params
    );

    const byTag = await pool.query(
      `select t.id, t.name, t.color, coalesce(sum(extract(epoch from (s.ended_at - s.started_at))), 0)::bigint as total_seconds
       from time_sessions s
       join session_tags st on st.session_id = s.id
       join tags t on t.id = st.tag_id
       where s.user_id = $1
         and s.ended_at is not null
         and ($2::timestamptz is null or s.started_at >= $2::timestamptz)
         and ($3::timestamptz is null or s.started_at <= $3::timestamptz)
         and ($4::uuid is null or st.tag_id = $4::uuid)
       group by t.id
       order by total_seconds desc`,
      params
    );

    res.json({
      summary: sessions.rows[0],
      buckets: buckets.rows,
      byTag: byTag.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get("/sessions", async (req, res, next) => {
  try {
    const query = paginationSchema
      .extend({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) })
      .parse(req.query);

    const result = await pool.query(
      `select s.id, s.started_at, s.ended_at, s.start_timezone, s.end_timezone, s.note,
              case when s.ended_at is null then null else extract(epoch from (s.ended_at - s.started_at))::bigint end as duration_seconds,
              coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) filter (where t.id is not null), '[]') as tags
       from time_sessions s
       left join session_tags st on st.session_id = s.id
       left join tags t on t.id = st.tag_id
       where s.user_id = $1
         and ($2::timestamptz is null or s.started_at >= $2::timestamptz)
         and ($3::timestamptz is null or s.started_at <= $3::timestamptz)
         and ($4::uuid is null or exists (select 1 from session_tags fst where fst.session_id = s.id and fst.tag_id = $4::uuid))
       group by s.id
       order by s.started_at desc
       limit $5 offset $6`,
      [req.user!.id, query.from ?? null, query.to ?? null, query.tagId ?? null, query.limit, query.offset]
    );

    res.json({ sessions: result.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/sessions/:id", async (req, res, next) => {
  try {
    assertActivityEditEnabled();
    const sessionId = uuidSchema.parse(req.params.id);
    const input = sessionUpdateSchema.parse(req.body);
    const startedAt = new Date(input.startedAt);
    const endedAt = input.endedAt ? new Date(input.endedAt) : null;
    const endTimezone = endedAt ? input.endTimezone ?? input.startTimezone : null;

    if (endedAt && endedAt <= startedAt) {
      throw new HttpError(400, "End time must be after start time");
    }

    const session = await withTransaction(async (client) => {
      const currentResult = await client.query(
        `select id, started_at, ended_at, start_timezone, end_timezone
         from time_sessions
         where id = $1 and user_id = $2
         for update`,
        [sessionId, req.user!.id]
      );
      if (!currentResult.rows[0]) {
        throw new HttpError(404, "Activity not found");
      }

      await assertUserTags(client, req.user!.id, input.tagIds);

      const updateResult = await client.query(
        `update time_sessions
         set started_at = $3,
             ended_at = $4,
             start_timezone = $5,
             end_timezone = $6,
             note = $7,
             source = 'manual_edit',
             status = case when $4::timestamptz is null then 'open'::work_session_status else 'closed'::work_session_status end,
             updated_at = now()
         where id = $1 and user_id = $2
         returning id, started_at, ended_at, start_timezone, end_timezone, note,
                   case when ended_at is null then null else extract(epoch from (ended_at - started_at))::bigint end as duration_seconds`,
        [sessionId, req.user!.id, startedAt, endedAt, input.startTimezone, endTimezone, input.note ?? null]
      );

      await client.query("delete from session_tags where session_id = $1", [sessionId]);
      for (const tagId of input.tagIds) {
        await client.query("insert into session_tags (session_id, tag_id) values ($1, $2)", [sessionId, tagId]);
      }

      const clockIn = await client.query(
        `select id, event_type, occurred_at, timezone
         from time_events
         where session_id = $1 and user_id = $2 and event_type = 'clock_in'
         order by occurred_at asc
         limit 1`,
        [sessionId, req.user!.id]
      );
      if (clockIn.rows[0]) {
        await client.query(
          `insert into time_event_revisions (
             time_event_id, changed_by_user_id, previous_event_type, previous_occurred_at,
             previous_client_timezone, new_event_type, new_occurred_at, new_client_timezone, reason
           )
           values ($1, $2, 'clock_in', $3, $4, 'clock_in', $5, $6, $7)`,
          [clockIn.rows[0].id, req.user!.id, clockIn.rows[0].occurred_at, clockIn.rows[0].timezone, startedAt, input.startTimezone, input.reason]
        );
        await client.query(
          `update time_events
           set occurred_at = $3, timezone = $4, note = $5, source = 'manual_edit', change_reason = $6
           where id = $1 and user_id = $2`,
          [clockIn.rows[0].id, req.user!.id, startedAt, input.startTimezone, input.note ?? null, input.reason]
        );
      } else {
        await client.query(
          `insert into time_events (user_id, session_id, event_type, occurred_at, timezone, note, source, change_reason, created_by_user_id)
           values ($1, $2, 'clock_in', $3, $4, $5, 'manual_edit', $6, $1)`,
          [req.user!.id, sessionId, startedAt, input.startTimezone, input.note ?? null, input.reason]
        );
      }

      const clockOut = await client.query(
        `select id, event_type, occurred_at, timezone
         from time_events
         where session_id = $1 and user_id = $2 and event_type = 'clock_out'
         order by occurred_at desc
         limit 1`,
        [sessionId, req.user!.id]
      );
      if (endedAt) {
        if (clockOut.rows[0]) {
          await client.query(
            `insert into time_event_revisions (
               time_event_id, changed_by_user_id, previous_event_type, previous_occurred_at,
               previous_client_timezone, new_event_type, new_occurred_at, new_client_timezone, reason
             )
             values ($1, $2, 'clock_out', $3, $4, 'clock_out', $5, $6, $7)`,
            [clockOut.rows[0].id, req.user!.id, clockOut.rows[0].occurred_at, clockOut.rows[0].timezone, endedAt, endTimezone, input.reason]
          );
          await client.query(
            `update time_events
             set occurred_at = $3, timezone = $4, note = $5, source = 'manual_edit', change_reason = $6
             where id = $1 and user_id = $2`,
            [clockOut.rows[0].id, req.user!.id, endedAt, endTimezone, input.note ?? null, input.reason]
          );
        } else {
          await client.query(
            `insert into time_events (user_id, session_id, event_type, occurred_at, timezone, note, source, change_reason, created_by_user_id)
             values ($1, $2, 'clock_out', $3, $4, $5, 'manual_edit', $6, $1)`,
            [req.user!.id, sessionId, endedAt, endTimezone, input.note ?? null, input.reason]
          );
        }
      } else if (clockOut.rows[0]) {
        await client.query("delete from time_events where id = $1 and user_id = $2", [clockOut.rows[0].id, req.user!.id]);
      }

      const tagResult = await client.query(
        `select t.id, t.name, t.color
         from session_tags st
         join tags t on t.id = st.tag_id
         where st.session_id = $1
         order by t.name`,
        [sessionId]
      );

      return { ...updateResult.rows[0], tags: tagResult.rows };
    });

    req.log?.info("activity updated", { userId: req.user!.id, sessionId, reason: input.reason });
    res.json({ session });
  } catch (error) {
    next(error);
  }
});

router.delete("/sessions/:id", async (req, res, next) => {
  try {
    assertActivityEditEnabled();
    const sessionId = uuidSchema.parse(req.params.id);

    const result = await pool.query("delete from time_sessions where id = $1 and user_id = $2 returning id", [sessionId, req.user!.id]);
    if (!result.rows[0]) {
      throw new HttpError(404, "Activity not found");
    }

    req.log?.info("activity deleted", { userId: req.user!.id, sessionId });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
