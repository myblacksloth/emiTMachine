import type { DbClient } from "../db.js";
import { HttpError } from "../errors.js";

export async function assertNoApprovedAdministrativeRequestOverlap(
  client: DbClient,
  userId: string,
  startedAt: Date,
  endedAt: Date
) {
  const result = await client.query(
    `select id
     from administrative_requests
     where user_id = $1
       and status = 'approved'
       and deleted_at is null
       and tstzrange(started_at, ended_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
     limit 1`,
    [userId, startedAt, endedAt]
  );
  if (result.rows[0]) {
    throw new HttpError(409, "An approved administrative request overlaps this work session");
  }
}

export async function assertNoWorkSessionOverlap(client: DbClient, userId: string, startedAt: Date, endedAt: Date) {
  const result = await client.query(
    `select id, started_at, ended_at
     from time_sessions
     where user_id = $1
       /*
        * Open sessions have no final end yet. For administrative request validation
        * they must block only the elapsed part of the current session, not every
        * future date. Otherwise any future vacation/leave request would overlap
        * the currently open activity forever.
        */
       and tstzrange(started_at, coalesce(ended_at, now()), '[)') &&
           tstzrange($2::timestamptz, $3::timestamptz, '[)')
     order by started_at
     limit 1`,
    [userId, startedAt, endedAt]
  );
  if (result.rows[0]) {
    throw new HttpError(409, "A work session overlaps this administrative request", {
      type: "work_session_overlap",
      requestedRange: {
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString()
      },
      session: {
        id: result.rows[0].id,
        startedAt: result.rows[0].started_at,
        endedAt: result.rows[0].ended_at
      }
    });
  }
}
