import { Router, type Request } from "express";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
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

const importRowsSchema = z.array(z.record(z.unknown())).default([]);

const userDataPayloadSchema = z.object({
  version: z.number().optional(),
  user: z.record(z.unknown()).optional(),
  tags: importRowsSchema,
  time_sessions: importRowsSchema,
  session_tags: importRowsSchema,
  time_events: importRowsSchema,
  countdowns: importRowsSchema,
  overtime_payments: importRowsSchema,
  administrative_requests: importRowsSchema
});

const userDataImportSchema = z.union([
  z.object({ data: userDataPayloadSchema }),
  userDataPayloadSchema
]);

async function assertCanManageResponsibleUser(req: Request, userId: string) {
  if (req.user?.role === "root") {
    return;
  }
  /*
   * Admin assignment management follows the same hierarchy used for request review.
   * A non-root admin may change responsible links only for users already inside their
   * direct or indirect responsibility subtree.
   */
  const result = await pool.query(
    `with recursive managed_tree as (
       select um.user_id
       from user_managers um
       where um.manager_user_id = $2

       union

       select um.user_id
       from user_managers um
       join managed_tree mt on mt.user_id = um.manager_user_id
     )
     select 1 from managed_tree where user_id = $1`,
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

async function assertCanExportImportUser(req: Request, userId: string) {
  const result = await pool.query(
    `select id, public_id, username, email, display_name, role, admin_approved, can_edit_sessions,
            overtime_enabled, overtime_mode, weekly_work_minutes, weekly_work_minutes_set_at,
            status, disabled_at, created_at, last_login_at
     from users
     where id = $1 and role <> 'root' and ($2::text = 'root' or role = 'user')`,
    [userId, req.user!.role]
  );
  if (!result.rows[0]) throw new HttpError(404, "User not found or cannot be exported by this admin");
  return result.rows[0];
}

function stringValue(row: Record<string, unknown>, key: string, fallback = "") {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function nullableStringValue(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(row: Record<string, unknown>, key: string, fallback = 0) {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(row: Record<string, unknown>, key: string, fallback = false) {
  const value = row[key];
  return typeof value === "boolean" ? value : fallback;
}

function safeSource(row: Record<string, unknown>) {
  const source = stringValue(row, "source", "admin_restore");
  // Imported CSV rows may not carry the original csv_import metadata, so restore them as admin records.
  return source === "csv_import" ? "admin_restore" : source;
}

function isDefaultTagName(name: string) {
  return ["presence", "smart working", "not billable"].includes(name.trim().toLowerCase());
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
    /*
     * Root needs the whole graph. Admins receive all links that are relevant to their
     * subtree, including links below descendant admins, so multi-level hierarchies are visible.
     */
    const result = await pool.query(
      req.user!.role === "root"
        ? `select user_id, manager_user_id, assigned_by_user_id, created_at
           from user_managers
           order by created_at desc`
        : `with recursive managed_tree as (
             select um.user_id
             from user_managers um
             where um.manager_user_id = $1

             union

             select um.user_id
             from user_managers um
             join managed_tree mt on mt.user_id = um.manager_user_id
           )
           select um.user_id, um.manager_user_id, um.assigned_by_user_id, um.created_at
           from user_managers um
           where um.manager_user_id = $1
              or um.manager_user_id in (select user_id from managed_tree)
              or um.user_id in (select user_id from managed_tree)
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

    /*
     * Prevent responsibility cycles such as admin1 -> admin2 -> admin1.
     * The recursive tree starts from the target user; if the intended manager already
     * appears below that target, adding this edge would make approvals ambiguous forever.
     */
    const cycleResult = await pool.query(
      `with recursive target_tree as (
         select um.user_id
         from user_managers um
         where um.manager_user_id = $1

         union

         select um.user_id
         from user_managers um
         join target_tree tt on tt.user_id = um.manager_user_id
       )
       select 1 from target_tree where user_id = $2`,
      [input.userId, managerId]
    );
    if (cycleResult.rows[0]) throw new HttpError(400, "This assignment would create a responsibility cycle");

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
                greatest(extract(epoch from (s.ended_at - s.started_at)) - s.no_count_minutes * 60, 0)::bigint as duration_seconds
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
      `select s.id, s.started_at, s.ended_at, s.start_timezone, s.end_timezone, s.note, s.no_count_minutes,
              case when s.ended_at is null then null else greatest(extract(epoch from (s.ended_at - s.started_at)) - s.no_count_minutes * 60, 0)::bigint end as duration_seconds,
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

router.delete("/administrative-requests/cleanup", async (req, res, next) => {
  try {
    requireRoot(req);
    // Only fully closed past-month requests are deleted; requests touching the current month stay available.
    const result = await pool.query(
      `with cutoff as (
         select date_trunc('month', now()) as month_start
       ),
       deleted as (
         delete from administrative_requests ar
         using cutoff
         where ar.ended_at < cutoff.month_start
         returning ar.id
       )
       select (select month_start from cutoff) as cutoff, count(*)::int as deleted_count
       from deleted`
    );
    const payload = result.rows[0] ?? { cutoff: new Date().toISOString(), deleted_count: 0 };
    req.log?.info("old administrative requests cleaned", {
      actorUserId: req.user!.id,
      cutoff: payload.cutoff,
      deletedCount: payload.deleted_count
    });
    res.json({ cutoff: payload.cutoff, deletedCount: payload.deleted_count });
  } catch (error) {
    next(error);
  }
});

router.get("/users/:id/export", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    const user = await assertCanExportImportUser(req, userId);
    const tables = {
      tags: await pool.query("select * from tags where user_id = $1 order by created_at, name", [userId]),
      time_sessions: await pool.query("select * from time_sessions where user_id = $1 order by started_at, created_at", [userId]),
      session_tags: await pool.query(
        `select st.*
         from session_tags st
         join time_sessions s on s.id = st.session_id
         where s.user_id = $1
         order by st.created_at`,
        [userId]
      ),
      time_events: await pool.query("select * from time_events where user_id = $1 order by occurred_at, created_at", [userId]),
      countdowns: await pool.query("select * from countdowns where user_id = $1 order by created_at", [userId]),
      overtime_payments: await pool.query("select * from overtime_payments where user_id = $1 order by week_start", [userId]),
      administrative_requests: await pool.query("select * from administrative_requests where user_id = $1 order by started_at, created_at", [userId])
    };

    res.header("Content-Type", "application/json");
    res.header("Content-Disposition", `attachment; filename="emitmachine-user-${user.username}.json"`);
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      user,
      tags: tables.tags.rows,
      time_sessions: tables.time_sessions.rows,
      session_tags: tables.session_tags.rows,
      time_events: tables.time_events.rows,
      countdowns: tables.countdowns.rows,
      overtime_payments: tables.overtime_payments.rows,
      administrative_requests: tables.administrative_requests.rows
    });
  } catch (error) {
    next(error);
  }
});

router.post("/users/:id/import", async (req, res, next) => {
  try {
    requireAdmin(req);
    const userId = uuidSchema.parse(req.params.id);
    await assertCanExportImportUser(req, userId);
    const parsed = userDataImportSchema.parse(req.body);
    const data = "data" in parsed ? parsed.data : parsed;

    const imported = await withTransaction(async (client) => {
      await client.query("delete from administrative_requests where user_id = $1", [userId]);
      await client.query("delete from overtime_payments where user_id = $1", [userId]);
      await client.query("delete from countdowns where user_id = $1", [userId]);
      await client.query("delete from time_sessions where user_id = $1", [userId]);
      await client.query("delete from tags where user_id = $1 and is_default = false", [userId]);

      const tagIdMap = new Map<string, string>();
      for (const tag of data.tags) {
        const originalId = stringValue(tag, "id");
        const name = stringValue(tag, "name");
        if (!name) continue;
        const result = await client.query(
          `insert into tags (user_id, name, color, is_default, is_archived, created_at, updated_at)
           values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), coalesce($7::timestamptz, now()))
           on conflict (user_id, name) do update
           set color = excluded.color,
               is_default = excluded.is_default,
               is_archived = excluded.is_archived,
               updated_at = now()
           returning id`,
          [
            userId,
            name,
            stringValue(tag, "color", "#8E8E93"),
            isDefaultTagName(name) || booleanValue(tag, "is_default", false),
            booleanValue(tag, "is_archived", false),
            nullableStringValue(tag, "created_at"),
            nullableStringValue(tag, "updated_at")
          ]
        );
        if (originalId) tagIdMap.set(originalId, result.rows[0].id);
      }

      for (const session of data.time_sessions) {
        const id = stringValue(session, "id");
        if (!id || !stringValue(session, "started_at")) continue;
        await client.query(
          `insert into time_sessions (
             id, user_id, started_at, ended_at, status, source, start_timezone, end_timezone,
             note, no_count_minutes, anomaly_reason, created_at, updated_at
           )
           values (
             $1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7, $8,
             $9, $10, $11, coalesce($12::timestamptz, now()), coalesce($13::timestamptz, now())
           )`,
          [
            id,
            userId,
            stringValue(session, "started_at"),
            nullableStringValue(session, "ended_at"),
            stringValue(session, "status", nullableStringValue(session, "ended_at") ? "closed" : "open"),
            safeSource(session),
            stringValue(session, "start_timezone", "UTC"),
            nullableStringValue(session, "end_timezone"),
            nullableStringValue(session, "note"),
            numberValue(session, "no_count_minutes", 0),
            nullableStringValue(session, "anomaly_reason"),
            nullableStringValue(session, "created_at"),
            nullableStringValue(session, "updated_at")
          ]
        );
      }

      for (const sessionTag of data.session_tags) {
        const sessionId = stringValue(sessionTag, "session_id");
        const importedTagId = tagIdMap.get(stringValue(sessionTag, "tag_id"));
        if (!sessionId || !importedTagId) continue;
        await client.query(
          `insert into session_tags (session_id, tag_id, created_at)
           values ($1, $2, coalesce($3::timestamptz, now()))
           on conflict do nothing`,
          [sessionId, importedTagId, nullableStringValue(sessionTag, "created_at")]
        );
      }

      for (const event of data.time_events) {
        const id = stringValue(event, "id");
        const sessionId = stringValue(event, "session_id");
        if (!id || !sessionId || !stringValue(event, "occurred_at")) continue;
        await client.query(
          `insert into time_events (
             id, user_id, session_id, event_type, occurred_at, source, timezone,
             client_submitted_at, note, change_reason, created_by_user_id, created_at
           )
           values (
             $1, $2, $3, $4, $5::timestamptz, $6, $7,
             coalesce($8::timestamptz, now()), $9, $10, $11, coalesce($12::timestamptz, now())
           )`,
          [
            id,
            userId,
            sessionId,
            stringValue(event, "event_type", "manual_adjustment"),
            stringValue(event, "occurred_at"),
            safeSource(event),
            stringValue(event, "timezone", "UTC"),
            nullableStringValue(event, "client_submitted_at"),
            nullableStringValue(event, "note"),
            nullableStringValue(event, "change_reason") ?? "Imported by admin",
            userId,
            nullableStringValue(event, "created_at")
          ]
        );
      }

      for (const countdown of data.countdowns) {
        const id = stringValue(countdown, "id");
        if (!id || !stringValue(countdown, "title") || !stringValue(countdown, "target_time")) continue;
        await client.query(
          `insert into countdowns (
             id, user_id, session_id, title, target_time, target_timezone, target_at,
             recurrence_rule, status, completed_at, created_at, updated_at
           )
           values (
             $1, $2, $3, $4, $5::time, $6, $7::timestamptz,
             $8, $9, $10::timestamptz, coalesce($11::timestamptz, now()), coalesce($12::timestamptz, now())
           )`,
          [
            id,
            userId,
            nullableStringValue(countdown, "session_id"),
            stringValue(countdown, "title"),
            stringValue(countdown, "target_time"),
            stringValue(countdown, "target_timezone", "UTC"),
            nullableStringValue(countdown, "target_at"),
            nullableStringValue(countdown, "recurrence_rule"),
            stringValue(countdown, "status", "active"),
            nullableStringValue(countdown, "completed_at"),
            nullableStringValue(countdown, "created_at"),
            nullableStringValue(countdown, "updated_at")
          ]
        );
      }

      for (const payment of data.overtime_payments) {
        const id = stringValue(payment, "id");
        if (!id || !stringValue(payment, "week_start")) continue;
        await client.query(
          `insert into overtime_payments (id, user_id, week_start, overtime_minutes, paid_at, paid_by_user_id, created_at)
           values ($1, $2, $3::date, $4, coalesce($5::timestamptz, now()), $6, coalesce($7::timestamptz, now()))
           on conflict (user_id, week_start) do update
           set overtime_minutes = excluded.overtime_minutes,
               paid_at = excluded.paid_at,
               paid_by_user_id = excluded.paid_by_user_id`,
          [
            id,
            userId,
            stringValue(payment, "week_start"),
            numberValue(payment, "overtime_minutes", 1),
            nullableStringValue(payment, "paid_at"),
            userId,
            nullableStringValue(payment, "created_at")
          ]
        );
      }

      for (const request of data.administrative_requests) {
        const id = stringValue(request, "id");
        if (!id || !stringValue(request, "started_at") || !stringValue(request, "ended_at")) continue;
        await client.query(
          `insert into administrative_requests (
             id, user_id, request_type, started_at, ended_at, status, note,
             decided_by_user_id, decided_at, deleted_by_user_id, deleted_at, created_at, updated_at
           )
           values (
             $1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7,
             $8, $9::timestamptz, $10, $11::timestamptz, coalesce($12::timestamptz, now()), coalesce($13::timestamptz, now())
           )`,
          [
            id,
            userId,
            stringValue(request, "request_type", "leave"),
            stringValue(request, "started_at"),
            stringValue(request, "ended_at"),
            stringValue(request, "status", "pending"),
            nullableStringValue(request, "note"),
            stringValue(request, "status", "pending") === "pending" ? null : userId,
            nullableStringValue(request, "decided_at"),
            nullableStringValue(request, "deleted_at") ? userId : null,
            nullableStringValue(request, "deleted_at"),
            nullableStringValue(request, "created_at"),
            nullableStringValue(request, "updated_at")
          ]
        );
      }

      return {
        tags: data.tags.length,
        sessions: data.time_sessions.length,
        events: data.time_events.length,
        countdowns: data.countdowns.length,
        overtimePayments: data.overtime_payments.length,
        administrativeRequests: data.administrative_requests.length
      };
    });

    req.log?.info("user data imported by admin", { actorUserId: req.user!.id, userId, imported });
    res.json({ imported });
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
