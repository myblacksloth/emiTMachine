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
    `select id
     from time_sessions
     where user_id = $1
       and tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz), '[)') &&
           tstzrange($2::timestamptz, $3::timestamptz, '[)')
     limit 1`,
    [userId, startedAt, endedAt]
  );
  if (result.rows[0]) {
    throw new HttpError(409, "A work session overlaps this administrative request");
  }
}
