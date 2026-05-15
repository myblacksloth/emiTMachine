import { Router, type Request } from "express";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, randomToken } from "../utils/crypto.js";
import { paginationSchema, uuidSchema } from "../utils/validators.js";

const router = Router();

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(200).optional()
});

const editPermissionSchema = z.object({
  canEditSessions: z.boolean()
});

const registrationSchema = z.object({
  enabled: z.boolean()
});

function requireAdmin(req: Request) {
  if (!req.user || (req.user.role !== "admin" && req.user.role !== "root")) {
    throw new HttpError(403, "Admin access required");
  }
}

function requireRoot(req: Request) {
  if (!req.user || req.user.role !== "root") {
    throw new HttpError(403, "Root access required");
  }
}

router.use(requireAuth);

router.get("/users", async (req, res, next) => {
  try {
    requireAdmin(req);
    const result = await pool.query(
      `select id, username, email, display_name, role, admin_approved, can_edit_sessions, status, disabled_at, created_at, last_login_at
       from users
       order by case role when 'root' then 0 when 'admin' then 1 else 2 end, created_at desc`
    );
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/users/:id/approve-admin", async (req, res, next) => {
  try {
    requireRoot(req);
    const userId = uuidSchema.parse(req.params.id);
    const result = await pool.query(
      `update users
       set admin_approved = true, updated_at = now()
       where id = $1 and role = 'admin'
       returning id`,
      [userId]
    );
    if (!result.rows[0]) throw new HttpError(404, "Pending admin not found");
    req.log?.info("admin approved", { actorUserId: req.user!.id, userId });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:id/edit-permission", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    const input = editPermissionSchema.parse(req.body);
    const result = await pool.query(
      `update users set can_edit_sessions = $3, updated_at = now()
       where id = $1 and role <> 'root' and ($2::text = 'root' or role = 'user')
       returning id`,
      [userId, req.user!.role, input.canEditSessions]
    );
    if (!result.rows[0]) throw new HttpError(404, "User not found or cannot be changed by this admin");
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/users/:id/reset-password", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    const input = resetPasswordSchema.parse(req.body);
    const temporaryPassword = input.password ?? randomToken(12);
    const passwordHash = await hashPassword(temporaryPassword);
    const result = await pool.query(
      `update users set password_hash = $3, password_changed_at = now(), updated_at = now()
       where id = $1 and role <> 'root' and ($2::text = 'root' or role = 'user')
       returning id`,
      [userId, req.user!.role, passwordHash]
    );
    if (!result.rows[0]) throw new HttpError(404, "User not found or cannot be changed by this admin");
    await pool.query("update app_sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [userId]);
    res.json({ temporaryPassword });
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    if (userId === req.user!.id) throw new HttpError(400, "You cannot delete your own account");
    const result = await pool.query(
      `delete from users
       where id = $1 and role <> 'root' and ($2::text = 'root' or role = 'user')
       returning id`,
      [userId, req.user!.role]
    );
    if (!result.rows[0]) throw new HttpError(404, "User not found or cannot be deleted by this admin");
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/settings/registration", async (req, res, next) => {
  try {
    requireRoot(req);
    const result = await pool.query("select coalesce((value #>> '{}')::boolean, true) as enabled from system_settings where key = 'registration_enabled'");
    res.json({ enabled: result.rows[0]?.enabled ?? true });
  } catch (error) {
    next(error);
  }
});

router.patch("/settings/registration", async (req, res, next) => {
  try {
    requireRoot(req);
    const input = registrationSchema.parse(req.body);
    await pool.query(
      `insert into system_settings (key, value)
       values ('registration_enabled', to_jsonb($1::boolean))
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [input.enabled]
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/users/:id/summary", async (req, res, next) => {
  try {
    requireAdmin(req);
    const query = paginationSchema.parse(req.query);
    const userId = uuidSchema.parse(req.params.id);
    const params: unknown[] = [userId, query.from ?? null, query.to ?? null, query.tagId ?? null];
    const summary = await pool.query(
      `with filtered as (
         select s.id, s.started_at, s.ended_at,
                extract(epoch from (s.ended_at - s.started_at))::bigint as duration_seconds
         from time_sessions s
         left join session_tags st on st.session_id = s.id
         where s.user_id = $1 and s.ended_at is not null
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
    res.json({ summary: summary.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/users/:id/sessions", async (req, res, next) => {
  try {
    requireAdmin(req);
    const query = paginationSchema
      .extend({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) })
      .parse(req.query);
    const userId = uuidSchema.parse(req.params.id);
    const result = await pool.query(
      `select s.id, s.started_at, s.ended_at, s.start_timezone, s.end_timezone, s.note,
              case when s.ended_at is null then null else extract(epoch from (s.ended_at - s.started_at))::bigint end as duration_seconds,
              coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) filter (where t.id is not null), '[]') as tags
       from time_sessions s
       left join session_tags st on st.session_id = s.id
       left join tags t on t.id = st.tag_id
       where s.user_id = $1
       group by s.id
       order by s.started_at desc
       limit $2 offset $3`,
      [userId, query.limit, query.offset]
    );
    res.json({ sessions: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/dump", async (req, res, next) => {
  try {
    requireRoot(req);
    const tables = ["users", "tags", "time_sessions", "session_tags", "time_events", "countdowns", "recovery_codes", "passkeys"] as const;
    const dump: Record<string, unknown[]> = {};
    for (const table of tables) {
      const result = await pool.query(`select * from ${table}`);
      dump[table] = result.rows;
    }
    res.header("Content-Type", "application/json");
    res.header("Content-Disposition", "attachment; filename=\"emitmachine-dump.json\"");
    res.json({ exportedAt: new Date().toISOString(), tables: dump });
  } catch (error) {
    next(error);
  }
});

router.get("/dump/users.csv", async (req, res, next) => {
  try {
    requireRoot(req);
    const result = await pool.query("select id, username, email, display_name, role, admin_approved, can_edit_sessions, status, created_at from users order by created_at");
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.header("Content-Disposition", "attachment; filename=\"emitmachine-users.csv\"");
    res.send(stringify(result.rows, { header: true }));
  } catch (error) {
    next(error);
  }
});

export default router;
