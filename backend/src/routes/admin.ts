import { Router, type Request } from "express";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { getOvertimeReport } from "./overtime.js";
import { hashPassword, randomToken } from "../utils/crypto.js";
import { emailSchema, paginationSchema, uuidSchema } from "../utils/validators.js";

const router = Router();

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(200).optional()
});

const editPermissionSchema = z.object({
  canEditSessions: z.boolean()
});

const publicIdSchema = z.object({
  publicId: z.string().trim().min(1).max(120)
});

const userProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: emailSchema.nullable().optional()
});

const overtimePermissionSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["overtime", "time_bank"])
});

const registrationSchema = z.object({
  enabled: z.boolean()
});

async function assertCanManageResponsibleUser(req: Request, userId: string) {
  if (req.user?.role === "root") {
    return;
  }
  const result = await pool.query(
    "select 1 from user_managers where user_id = $1 and manager_user_id = $2",
    [userId, req.user!.id]
  );
  if (!result.rows[0]) {
    throw new HttpError(403, "You can manage only users assigned to you");
  }
}

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
      `select id, public_id, username, email, display_name, role, admin_approved, can_edit_sessions,
              overtime_enabled, overtime_mode, weekly_work_minutes, weekly_work_minutes_set_at,
              status, disabled_at, created_at, last_login_at
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

router.patch("/users/:id/public-id", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    const input = publicIdSchema.parse(req.body);
    const result = await pool.query(
      `update users
       set public_id = $3, updated_at = now()
       where id = $1 and ($2::text = 'root' or role = 'user')
       returning id, public_id`,
      [userId, req.user!.role, input.publicId]
    );
    if (!result.rows[0]) throw new HttpError(404, "User not found or cannot be changed by this admin");
    req.log?.info("user public id updated", { actorUserId: req.user!.id, userId, publicId: input.publicId });
    res.json({ publicId: result.rows[0].public_id });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      next(new HttpError(409, "This user ID is already assigned"));
      return;
    }
    next(error);
  }
});

router.patch("/users/:id/profile", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    const input = userProfileSchema.parse(req.body);
    const result = await pool.query(
      `update users
       set display_name = $3,
           name = $3,
           email = $4,
           updated_at = now()
       where id = $1 and ($2::text = 'root' or role = 'user')
       returning id, email, display_name`,
      [userId, req.user!.role, input.displayName, input.email ?? null]
    );
    if (!result.rows[0]) throw new HttpError(404, "User not found or cannot be changed by this admin");
    req.log?.info("user profile updated by admin", { actorUserId: req.user!.id, userId });
    res.json({ user: { email: result.rows[0].email, displayName: result.rows[0].display_name } });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      next(new HttpError(409, "This email is already assigned"));
      return;
    }
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

router.patch("/users/:id/overtime-permission", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    const input = overtimePermissionSchema.parse(req.body);
    const result = await pool.query(
      `update users
       set overtime_enabled = $3,
           overtime_mode = $4,
           weekly_work_minutes = case when $3::boolean then weekly_work_minutes else null end,
           weekly_work_minutes_set_at = case when $3::boolean then weekly_work_minutes_set_at else null end,
           updated_at = now()
       where id = $1 and role <> 'root' and ($2::text = 'root' or role = 'user')
       returning id`,
      [userId, req.user!.role, input.enabled, input.mode]
    );
    if (!result.rows[0]) throw new HttpError(404, "User not found or cannot be changed by this admin");
    if (!input.enabled) {
      await pool.query("delete from overtime_payments where user_id = $1", [userId]);
    }
    req.log?.info("overtime permission updated", { actorUserId: req.user!.id, userId, enabled: input.enabled, mode: input.mode });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/manager-assignments", async (req, res, next) => {
  try {
    requireAdmin(req);
    const result = await pool.query(
      req.user!.role === "root"
        ? `select user_id, manager_user_id, assigned_by_user_id, created_at
           from user_managers
           order by created_at desc`
        : `select user_id, manager_user_id, assigned_by_user_id, created_at
           from user_managers
           where user_id in (select user_id from user_managers where manager_user_id = $1)
              or manager_user_id = $1
           order by created_at desc`,
      req.user!.role === "root" ? [] : [req.user!.id]
    );
    res.json({ assignments: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/users/:managerId/managed-users", async (req, res, next) => {
  try {
    requireAdmin(req);
    const managerId = uuidSchema.parse(req.params.managerId);
    const input = z.object({ userId: uuidSchema }).parse(req.body);
    if (managerId === input.userId) {
      throw new HttpError(400, "A user cannot be responsible for themselves");
    }
    await assertCanManageResponsibleUser(req, input.userId);

    const managerResult = await pool.query(
      `select id from users
       where id = $1 and role = 'admin' and admin_approved = true and disabled_at is null`,
      [managerId]
    );
    if (!managerResult.rows[0]) throw new HttpError(400, "Manager must be an approved admin user");

    const userResult = await pool.query("select id from users where id = $1 and role <> 'root' and disabled_at is null", [input.userId]);
    if (!userResult.rows[0]) throw new HttpError(404, "Managed user not found");

    const result = await pool.query(
      `insert into user_managers (user_id, manager_user_id, assigned_by_user_id)
       values ($1, $2, $3)
       on conflict (user_id, manager_user_id) do nothing
       returning user_id, manager_user_id, assigned_by_user_id, created_at`,
      [input.userId, managerId, req.user!.id]
    );
    req.log?.info("manager assigned", { actorUserId: req.user!.id, userId: input.userId, managerId });
    res.status(result.rows[0] ? 201 : 200).json({ assignment: result.rows[0] ?? { user_id: input.userId, manager_user_id: managerId } });
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:managerId/managed-users/:userId", async (req, res, next) => {
  try {
    requireAdmin(req);
    const managerId = uuidSchema.parse(req.params.managerId);
    const userId = uuidSchema.parse(req.params.userId);
    await assertCanManageResponsibleUser(req, userId);
    const result = await pool.query(
      "delete from user_managers where user_id = $1 and manager_user_id = $2 returning user_id",
      [userId, managerId]
    );
    if (!result.rows[0]) throw new HttpError(404, "Manager assignment not found");
    req.log?.info("manager assignment removed", { actorUserId: req.user!.id, userId, managerId });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:id/overtime-payments/:weekStart", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    const weekStart = z.string().date().parse(req.params.weekStart);
    const result = await pool.query(
      `delete from overtime_payments op
       using users u
       where op.user_id = u.id
         and op.user_id = $1
         and op.week_start = $3::date
         and u.role <> 'root'
         and ($2::text = 'root' or u.role = 'user')
       returning op.id`,
      [userId, req.user!.role, weekStart]
    );
    if (!result.rows[0]) throw new HttpError(404, "Payment status not found or cannot be changed by this admin");
    req.log?.info("overtime payment removed by admin", { actorUserId: req.user!.id, userId, weekStart });
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

router.get("/users/:id/overtime", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    const userResult = await pool.query(
      `select id from users
       where id = $1 and role <> 'root' and ($2::text = 'root' or role = 'user')`,
      [userId, req.user!.role]
    );
    if (!userResult.rows[0]) throw new HttpError(404, "User not found or cannot be viewed by this admin");
    res.json(await getOvertimeReport(userId));
  } catch (error) {
    next(error);
  }
});

router.get("/dump", async (req, res, next) => {
  try {
    requireRoot(req);
    const tables = ["users", "user_managers", "administrative_requests", "tags", "time_sessions", "session_tags", "time_events", "countdowns", "overtime_payments", "recovery_codes", "passkeys"] as const;
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
    const result = await pool.query(
      `select id, public_id, username, email, display_name, role, admin_approved, can_edit_sessions,
              overtime_enabled, overtime_mode, weekly_work_minutes, weekly_work_minutes_set_at,
              status, created_at
       from users
       order by created_at`
    );
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.header("Content-Disposition", "attachment; filename=\"emitmachine-users.csv\"");
    res.send(stringify(result.rows, { header: true }));
  } catch (error) {
    next(error);
  }
});

export default router;
