import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { hashPassword, verifyPassword } from "../utils/crypto.js";
import { emailSchema, passwordSchema } from "../utils/validators.js";

const router = Router();

router.use(requireAuth);

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: emailSchema.nullable().optional()
});

router.patch("/", async (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    const result = await pool.query(
      `update users
       set display_name = $2,
           name = $2,
           email = $3,
           updated_at = now()
       where id = $1
       returning id, public_id, username, email, display_name, role, admin_approved, can_edit_sessions, totp_enabled`,
      [req.user!.id, input.displayName, input.email ?? null]
    );
    res.json({
      user: {
        id: result.rows[0].id,
        publicId: result.rows[0].public_id,
        username: result.rows[0].username,
        email: result.rows[0].email,
        displayName: result.rows[0].display_name,
        role: result.rows[0].role,
        adminApproved: result.rows[0].admin_approved,
        canEditSessions: result.rows[0].can_edit_sessions,
        totpEnabled: result.rows[0].totp_enabled
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      next(new HttpError(409, "This email is already assigned"));
      return;
    }
    next(error);
  }
});

router.get("/managers", async (req, res, next) => {
  try {
    const result = await pool.query(
      `select m.id, m.public_id, m.username, m.email, m.display_name
       from user_managers um
       join users m on m.id = um.manager_user_id
       where um.user_id = $1 and m.role = 'admin' and m.admin_approved = true and m.disabled_at is null
       order by lower(m.display_name), lower(m.username)`,
      [req.user!.id]
    );
    res.json({
      managers: result.rows.map((row) => ({
        id: row.id,
        publicId: row.public_id,
        username: row.username,
        email: row.email,
        displayName: row.display_name
      }))
    });
  } catch (error) {
    next(error);
  }
});

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
    await logAudit({
      userId: req.user!.id,
      eventType: "password_change",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string | undefined
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
