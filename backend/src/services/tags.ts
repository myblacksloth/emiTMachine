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
