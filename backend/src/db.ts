import pg from "pg";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

export const pool = new pg.Pool({
  connectionString: config.databaseUrl
});

pool.on("error", (error) => {
  logger.error("postgres pool error", { error });
});

export type DbClient = pg.PoolClient | pg.Pool;

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
