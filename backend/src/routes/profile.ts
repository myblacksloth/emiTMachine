import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../utils/crypto.js";
import { passwordSchema } from "../utils/validators.js";

const router = Router();

router.use(requireAuth);

router.patch("/password", async (req, res, next) => {
  try {
    const input = z
      .object({
        currentPassword: z.string().min(1).max(200),
        newPassword: passwordSchema
      })
      .parse(req.body);

    const result = await pool.query("select password_hash from users where id = $1", [req.user!.id]);
    if (!result.rows[0] || !(await verifyPassword(input.currentPassword, result.rows[0].password_hash))) {
      throw new HttpError(401, "Current password is invalid");
    }

    await pool.query("update users set password_hash = $2, updated_at = now() where id = $1", [
      req.user!.id,
      await hashPassword(input.newPassword)
    ]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
