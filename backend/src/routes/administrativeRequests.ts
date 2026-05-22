import { Router, type Request } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { assertNoWorkSessionOverlap } from "../services/administrativeRequests.js";
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

function requireReviewer(req: Request) {
  if (!req.user || (req.user.role !== "root" && req.user.role !== "admin")) {
    throw new HttpError(403, "Administrative request review requires admin access");
  }
}

async function assertCanReviewRequest(req: Request, requestUserId: string) {
  if (req.user?.role === "root") return;
  const result = await pool.query("select 1 from user_managers where user_id = $1 and manager_user_id = $2", [requestUserId, req.user!.id]);
  if (!result.rows[0]) {
    throw new HttpError(403, "You can review only requests from users assigned to you");
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
    const result = await pool.query(
      req.user!.role === "root"
        ? `select ar.*, u.username as requester_username, u.display_name as requester_display_name, u.public_id as requester_public_id
           from administrative_requests ar
           join users u on u.id = ar.user_id
           order by ar.created_at desc`
        : `select ar.*, u.username as requester_username, u.display_name as requester_display_name, u.public_id as requester_public_id
           from administrative_requests ar
           join users u on u.id = ar.user_id
           join user_managers um on um.user_id = ar.user_id and um.manager_user_id = $1
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
      if (input.status === "approved") {
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
