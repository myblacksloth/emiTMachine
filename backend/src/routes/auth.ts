import { Router } from "express";
import speakeasy from "speakeasy";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { createSession, clearSessionCookie, setSessionCookie } from "../services/sessions.js";
import { decryptTotpSecret, hashPassword, sha256, verifyPassword } from "../utils/crypto.js";
import { emailSchema, passwordSchema, usernameSchema } from "../utils/validators.js";

const router = Router();

const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema.optional(),
  password: passwordSchema,
  displayName: z.string().trim().max(120).optional()
});

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(200),
  totpCode: z.string().trim().min(6).max(8).optional(),
  recoveryCode: z.string().trim().min(8).max(32).optional()
});

const recoverPasswordSchema = z.object({
  username: usernameSchema,
  recoveryCode: z.string().trim().min(8).max(32),
  totpCode: z.string().trim().min(6).max(8).optional(),
  newPassword: passwordSchema
});

function publicUser(row: { id: string; username: string; email?: string | null; display_name: string; role: string; totp_enabled?: boolean }) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    totpEnabled: Boolean(row.totp_enabled)
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);

    const user = await withTransaction(async (client) => {
      const result = await client.query(
        `insert into users (username, email, password_hash, display_name)
         values ($1, $2, $3, $4)
         returning id, username, email, display_name, role, totp_enabled`,
        [input.username, input.email ?? null, passwordHash, input.displayName || input.username]
      );

      const userId = result.rows[0].id;
      await client.query(
        `insert into tags (user_id, name, color, is_default)
         values ($1, 'Presence', '#21A67A', true), ($1, 'Smart working', '#3B82F6', true)`,
        [userId]
      );

      const session = await createSession(client, userId);
      return { row: result.rows[0], session };
    });

    setSessionCookie(res, user.session.token, user.session.expiresAt);
    req.log?.info("user registered", { userId: user.row.id, username: user.row.username });
    res.status(201).json({ user: publicUser(user.row) });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      req.log?.warn("registration conflict", { username: req.body?.username });
      next(new HttpError(409, "A user with this username or email already exists"));
      return;
    }
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await pool.query(
      `select id, username, email, password_hash, display_name, role, totp_enabled, totp_secret, disabled_at
       from users
       where username = $1`,
      [input.username]
    );

    const user = result.rows[0];
    if (!user || user.disabled_at || !(await verifyPassword(input.password, user.password_hash))) {
      req.log?.warn("login failed", { username: input.username, reason: "invalid_credentials" });
      throw new HttpError(401, "Invalid username or password");
    }

    if (user.totp_enabled && !input.totpCode && !input.recoveryCode) {
      req.log?.info("login requires second factor", { userId: user.id, username: user.username });
      res.status(202).json({ requiresTotp: true, message: "TOTP or recovery code is required" });
      return;
    }

    if (user.totp_enabled && input.totpCode) {
      const valid = speakeasy.totp.verify({
        secret: decryptTotpSecret(user.totp_secret),
        encoding: "base32",
        token: input.totpCode,
        window: 1
      });
      if (!valid) {
        req.log?.warn("login failed", { userId: user.id, username: user.username, reason: "invalid_totp" });
        throw new HttpError(401, "Invalid TOTP code");
      }
    }

    if (user.totp_enabled && !input.totpCode && input.recoveryCode) {
      const recoveryHash = sha256(input.recoveryCode);
      const recoveryResult = await pool.query(
        `update recovery_codes
         set used_at = now()
         where user_id = $1 and code_hash = $2 and used_at is null
         returning id`,
        [user.id, recoveryHash]
      );
      if (!recoveryResult.rows[0]) {
        req.log?.warn("login failed", { userId: user.id, username: user.username, reason: "invalid_recovery_code" });
        throw new HttpError(401, "Invalid recovery code");
      }
    }

    const session = await createSession(pool, user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    req.log?.info("login succeeded", { userId: user.id, username: user.username });
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await pool.query("update app_sessions set revoked_at = now() where id = $1", [req.sessionId]);
    clearSessionCookie(res);
    req.log?.info("logout succeeded", { userId: req.user!.id });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/recover-password", async (req, res, next) => {
  try {
    const input = recoverPasswordSchema.parse(req.body);
    await withTransaction(async (client) => {
      const userResult = await client.query(
        `select id, totp_enabled, totp_secret
         from users
         where username = $1 and disabled_at is null
         for update`,
        [input.username]
      );
      const user = userResult.rows[0];
      if (!user) {
        req.log?.warn("password recovery failed", { username: input.username, reason: "unknown_user" });
        throw new HttpError(401, "Invalid recovery request");
      }

      if (user.totp_enabled) {
        if (!input.totpCode) {
          throw new HttpError(400, "TOTP code is required");
        }
        const validTotp = speakeasy.totp.verify({
          secret: decryptTotpSecret(user.totp_secret),
          encoding: "base32",
          token: input.totpCode,
          window: 1
        });
        if (!validTotp) {
          req.log?.warn("password recovery failed", { userId: user.id, username: input.username, reason: "invalid_totp" });
          throw new HttpError(401, "Invalid recovery request");
        }
      }

      const recoveryResult = await client.query(
        `update recovery_codes
         set used_at = now()
         where user_id = $1 and code_hash = $2 and used_at is null
         returning id`,
        [user.id, sha256(input.recoveryCode)]
      );
      if (!recoveryResult.rows[0]) {
        req.log?.warn("password recovery failed", { userId: user.id, username: input.username, reason: "invalid_recovery_code" });
        throw new HttpError(401, "Invalid recovery request");
      }

      await client.query("update users set password_hash = $2, updated_at = now() where id = $1", [
        user.id,
        await hashPassword(input.newPassword)
      ]);
      await client.query("update app_sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [user.id]);
      req.log?.info("password recovered", { userId: user.id, username: input.username });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const passkeys = await pool.query("select count(*)::int as count from passkeys where user_id = $1", [req.user!.id]);
    res.json({ user: { ...req.user, passkeyCount: Number(passkeys.rows[0]?.count ?? 0) } });
  } catch (error) {
    next(error);
  }
});

export default router;
