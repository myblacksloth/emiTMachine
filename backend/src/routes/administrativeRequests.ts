import { Router, type Request } from "express";
import { z } from "zod";
import { pool, withTransaction, type DbClient } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { assertNoApprovedAdministrativeRequestOverlap, assertNoWorkSessionOverlap } from "../services/administrativeRequests.js";
import { assertTagsAreCompatible, assertUserTags } from "../services/tags.js";
import { isoDateTimeSchema, uuidSchema } from "../utils/validators.js";

const router = Router();

const requestCreateSchema = z.object({
  requestType: z.enum(["vacation", "leave", "smart_working"]),
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema,
  note: z.string().trim().max(1000).optional()
});

const requestStatusSchema = z.object({
  status: z.enum(["approved", "revoked"])
});

const activitySessionPayloadSchema = z.object({
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable().optional(),
  startTimezone: z.string().trim().min(1).max(80),
  endTimezone: z.string().trim().min(1).max(80).nullable().optional(),
  note: z.string().trim().max(1000).optional(),
  tagIds: z.array(uuidSchema).min(1).max(10),
  reason: z.string().trim().min(3).max(500),
  noCountMinutes: z.number().int().min(0).max(10080).default(0)
});

const activityChangePayloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), session: activitySessionPayloadSchema }),
  z.object({ action: z.literal("update"), sessionId: uuidSchema, session: activitySessionPayloadSchema }),
  z.object({ action: z.literal("delete"), sessionId: uuidSchema })
]);

function requireReviewer(req: Request) {
  if (!req.user || (req.user.role !== "root" && req.user.role !== "admin")) {
    throw new HttpError(403, "Administrative request review requires admin access");
  }
}

async function assertCanReviewRequest(req: Request, requestUserId: string) {
  if (req.user?.role === "root") return;
  /*
   * Review permissions are hierarchical:
   * - an admin can review every direct or indirect descendant in user_managers;
   * - a top-level admin, meaning an admin with no assigned responsible, can review their own requests;
   * - an admin assigned to another admin cannot review their own requests, because their responsible admin must do it.
   */
  const result = await pool.query(
    `with recursive managed_tree as (
       select um.user_id
       from user_managers um
       where um.manager_user_id = $1

       union

       select um.user_id
       from user_managers um
       join managed_tree mt on mt.user_id = um.manager_user_id
     ),
     top_level_self as (
       select u.id
       from users u
       where u.id = $1
         and u.role = 'admin'
         and not exists (select 1 from user_managers own_managers where own_managers.user_id = u.id)
     )
     select 1
     where exists (select 1 from managed_tree where user_id = $2)
        or exists (select 1 from top_level_self where id = $2)`,
    [req.user!.id, requestUserId]
  );
  if (!result.rows[0]) {
    throw new HttpError(403, "You can review only requests from your hierarchy");
  }
}

function mapRequest(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    requestType: row.request_type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    note: row.note,
    decidedByUserId: row.decided_by_user_id,
    decidedAt: row.decided_at,
    deletedByUserId: row.deleted_by_user_id,
    deletedAt: row.deleted_at,
    activityChangeAction: row.activity_change_action,
    activityChangePayload: row.activity_change_payload,
    createdAt: row.created_at,
    requester: row.requester_username
      ? {
          username: row.requester_username,
          displayName: row.requester_display_name,
          publicId: row.requester_public_id
        }
      : undefined
  };
}

async function applyActivityChangeRequest(client: DbClient, request: Record<string, unknown>, actorUserId: string) {
  /*
   * Activity-change requests are delayed writes for historical sessions. Approval is
   * the only place where the queued JSON payload is allowed to mutate time_sessions.
   */
  const payload = activityChangePayloadSchema.parse(request.activity_change_payload);
  const userId = String(request.user_id);

  if (payload.action === "delete") {
    await client.query("delete from time_sessions where id = $1 and user_id = $2", [payload.sessionId, userId]);
    return;
  }

  const input = payload.session;
  const startedAt = new Date(input.startedAt);
  const endedAt = input.endedAt ? new Date(input.endedAt) : null;
  const endTimezone = endedAt ? input.endTimezone ?? input.startTimezone : null;

  if (endedAt && endedAt <= startedAt) {
    throw new HttpError(400, "End time must be after start time");
  }
  if (endedAt && input.noCountMinutes > Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000)) {
    throw new HttpError(400, "No count time cannot exceed session duration");
  }

  await assertUserTags(client, userId, input.tagIds);
  await assertTagsAreCompatible(client, userId, input.tagIds);
  await assertNoApprovedAdministrativeRequestOverlap(client, userId, startedAt, endedAt ?? new Date(startedAt.getTime() + 1));

  let sessionId = payload.action === "update" ? payload.sessionId : "";
  if (payload.action === "create") {
    const result = await client.query(
      `insert into time_sessions (user_id, started_at, ended_at, start_timezone, end_timezone, note, no_count_minutes, source)
       values ($1, $2, $3, $4, $5, $6, $7, 'admin_restore')
       returning id`,
      [userId, startedAt, endedAt, input.startTimezone, endTimezone, input.note ?? null, input.noCountMinutes]
    );
    sessionId = result.rows[0].id;
  } else {
    const result = await client.query(
      `update time_sessions
       set started_at = $3,
           ended_at = $4,
           start_timezone = $5,
           end_timezone = $6,
           note = $7,
           no_count_minutes = $8,
           source = 'admin_restore',
           status = case when $4::timestamptz is null then 'open'::work_session_status else 'closed'::work_session_status end,
           updated_at = now()
       where id = $1 and user_id = $2
       returning id`,
      [sessionId, userId, startedAt, endedAt, input.startTimezone, endTimezone, input.note ?? null, input.noCountMinutes]
    );
    if (!result.rows[0]) throw new HttpError(404, "Activity not found");
    await client.query("delete from session_tags where session_id = $1", [sessionId]);
    await client.query("delete from time_events where session_id = $1 and user_id = $2", [sessionId, userId]);
  }

  for (const tagId of input.tagIds) {
    await client.query("insert into session_tags (session_id, tag_id) values ($1, $2) on conflict do nothing", [sessionId, tagId]);
  }

  await client.query(
    `insert into time_events (user_id, session_id, event_type, occurred_at, timezone, note, source, change_reason, created_by_user_id)
     values ($1, $2, 'clock_in', $3, $4, $5, 'admin_restore', $6, $7)`,
    [userId, sessionId, startedAt, input.startTimezone, input.note ?? null, input.reason, actorUserId]
  );

  if (endedAt) {
    await client.query(
      `insert into time_events (user_id, session_id, event_type, occurred_at, timezone, note, source, change_reason, created_by_user_id)
       values ($1, $2, 'clock_out', $3, $4, $5, 'admin_restore', $6, $7)`,
      [userId, sessionId, endedAt, endTimezone, input.note ?? null, input.reason, actorUserId]
    );
  }
}

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `select *
       from administrative_requests
       where user_id = $1
       order by started_at desc`,
      [req.user!.id]
    );
    res.json({ requests: result.rows.map(mapRequest) });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = requestCreateSchema.parse(req.body);
    const startedAt = new Date(input.startedAt);
    const endedAt = new Date(input.endedAt);
    if (endedAt <= startedAt) {
      throw new HttpError(400, "Request end time must be after start time");
    }

    const request = await withTransaction(async (client) => {
      await assertNoWorkSessionOverlap(client, req.user!.id, startedAt, endedAt);
      const result = await client.query(
        `insert into administrative_requests (user_id, request_type, started_at, ended_at, note)
         values ($1, $2, $3, $4, $5)
         returning *`,
        [req.user!.id, input.requestType, startedAt, endedAt, input.note ?? null]
      );
      return result.rows[0];
    });

    req.log?.info("administrative request created", { userId: req.user!.id, requestId: request.id, requestType: input.requestType });
    res.status(201).json({ request: mapRequest(request) });
  } catch (error) {
    if ((error as { code?: string }).code === "23P01") {
      next(new HttpError(409, "Another administrative request overlaps this time range"));
      return;
    }
    next(error);
  }
});

router.get("/review", async (req, res, next) => {
  try {
    requireReviewer(req);
    /*
     * Root sees every request. Admins see requests from their whole responsibility subtree.
     * If an admin has no responsible admin above them, their own requests are included as top-level self-review.
     */
    const result = await pool.query(
      req.user!.role === "root"
        ? `select ar.*, u.username as requester_username, u.display_name as requester_display_name, u.public_id as requester_public_id
           from administrative_requests ar
           join users u on u.id = ar.user_id
           order by ar.created_at desc`
        : `with recursive reviewable_users as (
             select um.user_id
             from user_managers um
             where um.manager_user_id = $1

             union

             select um.user_id
             from user_managers um
             join reviewable_users ru on ru.user_id = um.manager_user_id
           ),
           top_level_self as (
             select u.id as user_id
             from users u
             where u.id = $1
               and u.role = 'admin'
               and not exists (select 1 from user_managers own_managers where own_managers.user_id = u.id)
           ),
           visible_users as (
             select user_id from reviewable_users
             union
             select user_id from top_level_self
           )
           select ar.*, u.username as requester_username, u.display_name as requester_display_name, u.public_id as requester_public_id
           from administrative_requests ar
           join users u on u.id = ar.user_id
           join visible_users vu on vu.user_id = ar.user_id
           order by ar.created_at desc`,
      req.user!.role === "root" ? [] : [req.user!.id]
    );
    res.json({ requests: result.rows.map(mapRequest) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    requireReviewer(req);
    const requestId = uuidSchema.parse(req.params.id);
    const input = requestStatusSchema.parse(req.body);

    const request = await withTransaction(async (client) => {
      const currentResult = await client.query("select * from administrative_requests where id = $1 for update", [requestId]);
      const current = currentResult.rows[0];
      if (!current) throw new HttpError(404, "Administrative request not found");
      if (current.deleted_at) throw new HttpError(400, "Deleted administrative requests cannot be reviewed");
      await assertCanReviewRequest(req, current.user_id);
      if (input.status === "approved" && current.request_type === "activity_change") {
        await applyActivityChangeRequest(client, current, req.user!.id);
      } else if (input.status === "approved") {
        await assertNoWorkSessionOverlap(client, current.user_id, new Date(current.started_at), new Date(current.ended_at));
      }
      const updateResult = await client.query(
        `update administrative_requests
         set status = $2,
             decided_by_user_id = $3,
             decided_at = now(),
             updated_at = now()
         where id = $1
         returning *`,
        [requestId, input.status, req.user!.id]
      );
      return updateResult.rows[0];
    });

    req.log?.info("administrative request reviewed", { actorUserId: req.user!.id, requestId, status: input.status });
    res.json({ request: mapRequest(request) });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const requestId = uuidSchema.parse(req.params.id);
    const result = await withTransaction(async (client) => {
      const currentResult = await client.query("select * from administrative_requests where id = $1 and user_id = $2 for update", [requestId, req.user!.id]);
      const current = currentResult.rows[0];
      if (!current) throw new HttpError(404, "Administrative request not found");

      if (current.status === "pending") {
        await client.query("delete from administrative_requests where id = $1", [requestId]);
        return { mode: "deleted", request: null };
      }

      const updateResult = await client.query(
        `update administrative_requests
         set deleted_by_user_id = $2,
             deleted_at = coalesce(deleted_at, now()),
             updated_at = now()
         where id = $1
         returning *`,
        [requestId, req.user!.id]
      );
      return { mode: "marked_deleted", request: mapRequest(updateResult.rows[0]) };
    });

    req.log?.info("administrative request deleted by owner", { userId: req.user!.id, requestId, mode: result.mode });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
