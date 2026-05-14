import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { paginationSchema } from "../utils/validators.js";

const router = Router();

router.use(requireAuth);

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

export default router;
