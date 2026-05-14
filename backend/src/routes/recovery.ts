import { Router } from "express";
import { pool, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { generateRecoveryCode, sha256 } from "../utils/crypto.js";

const router = Router();

router.post("/codes", requireAuth, async (req, res, next) => {
  try {
    const codes = Array.from({ length: 10 }, generateRecoveryCode);
    const hashes = codes.map((code) => sha256(code));

    await withTransaction(async (client) => {
      await client.query("delete from recovery_codes where user_id = $1", [req.user!.id]);
      for (const hash of hashes) {
        await client.query("insert into recovery_codes (user_id, code_hash) values ($1, $2)", [req.user!.id, hash]);
      }
    });

    res.status(201).json({ codes });
  } catch (error) {
    next(error);
  }
});

router.get("/codes", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `select count(*) filter (where used_at is null) as remaining
       from recovery_codes
       where user_id = $1`,
      [req.user!.id]
    );
    res.json({ remaining: Number(result.rows[0]?.remaining ?? 0) });
  } catch (error) {
    next(error);
  }
});

export default router;
