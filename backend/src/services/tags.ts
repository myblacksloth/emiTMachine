import type { DbClient } from "../db.js";
import { HttpError } from "../errors.js";

export async function assertUserTags(client: DbClient, userId: string, tagIds: string[]) {
  if (tagIds.length === 0) {
    return;
  }

  const result = await client.query(
    `select id from tags where user_id = $1 and id = any($2::uuid[])`,
    [userId, tagIds]
  );

  if (result.rowCount !== tagIds.length) {
    throw new HttpError(400, "One or more tags do not belong to the current user");
  }
}

export async function assertTagsAreCompatible(client: DbClient, userId: string, tagIds: string[]) {
  if (tagIds.length < 2) {
    return;
  }

  const result = await client.query(
    `select lower(name::text) as name
     from tags
     where user_id = $1 and id = any($2::uuid[]) and lower(name::text) in ('presence', 'smart working')`,
    [userId, tagIds]
  );
  const selectedNames = new Set(result.rows.map((row: { name: string }) => row.name));

  // Presence and Smart working describe alternative work modes, so a session cannot be both.
  if (selectedNames.has("presence") && selectedNames.has("smart working")) {
    throw new HttpError(400, "Presence and Smart working cannot be selected together");
  }
}
