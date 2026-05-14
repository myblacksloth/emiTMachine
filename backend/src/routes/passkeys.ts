import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { createSession, setSessionCookie } from "../services/sessions.js";
import { randomToken, sha256 } from "../utils/crypto.js";
import { usernameSchema } from "../utils/validators.js";

const router = Router();

router.post("/register/options", requireAuth, async (req, res, next) => {
  try {
    const challenge = randomToken();
    await pool.query(
      `insert into passkey_challenges (user_id, challenge_hash, type, expires_at)
       values ($1, $2, 'registration', now() + interval '10 minutes')`,
      [req.user!.id, sha256(challenge)]
    );
    req.log?.info("passkey registration challenge created", { userId: req.user!.id, username: req.user!.username });

    res.json({
      publicKey: {
        challenge,
        rp: { id: config.rpId, name: config.rpName },
        user: { id: req.user!.id, name: req.user!.username, displayName: req.user!.displayName },
        timeout: 600000,
        attestation: "none"
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/register/verify", requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({
        challenge: z.string().min(16),
        credentialId: z.string().trim().min(8).max(4096),
        publicKey: z.string().trim().min(8).max(8192).optional(),
        label: z.string().trim().min(1).max(120).optional()
      })
      .parse(req.body);

    const challengeHash = sha256(input.challenge);
    const challengeResult = await pool.query(
      `update passkey_challenges
       set consumed_at = now()
       where user_id = $1 and challenge_hash = $2 and type = 'registration' and consumed_at is null and expires_at > now()
       returning id`,
      [req.user!.id, challengeHash]
    );
    if (!challengeResult.rows[0]) {
      req.log?.warn("passkey registration failed", { userId: req.user!.id, username: req.user!.username, reason: "invalid_challenge" });
      throw new HttpError(400, "Invalid or expired passkey registration challenge");
    }

    await pool.query(
      `insert into passkeys (user_id, credential_id, public_key, device_name)
       values ($1, $2, $3, $4)
       on conflict (credential_id) do update set device_name = excluded.device_name, updated_at = now()`,
      [req.user!.id, input.credentialId, input.publicKey ?? input.credentialId, input.label ?? "Passkey"]
    );
    req.log?.info("passkey registered", { userId: req.user!.id, username: req.user!.username, label: input.label ?? "Passkey" });
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/login/options", async (req, res, next) => {
  try {
    const input = z.object({ username: usernameSchema.optional() }).parse(req.body);
    const challenge = randomToken();
    const userResult = input.username ? await pool.query("select id from users where username = $1", [input.username]) : null;
    const userId = userResult?.rows[0]?.id ?? null;
    await pool.query(
      `insert into passkey_challenges (user_id, challenge_hash, type, expires_at)
       values ($1, $2, 'authentication', now() + interval '10 minutes')`,
      [userId, sha256(challenge)]
    );
    req.log?.info("passkey login challenge created", { username: input.username, userId });

    res.json({
      publicKey: {
        challenge,
        rpId: config.rpId,
        timeout: 600000,
        userVerification: "preferred"
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login/verify", async (req, res, next) => {
  try {
    const input = z
      .object({
        username: usernameSchema.optional(),
        challenge: z.string().min(16),
        credentialId: z.string().trim().min(8).max(4096)
      })
      .parse(req.body);

    const passkeyResult = await pool.query(
      `select p.id as passkey_id, u.id, u.username, u.disabled_at
       from passkeys p
       join users u on u.id = p.user_id
       where p.credential_id = $1 and ($2::citext is null or u.username = $2::citext)`,
      [input.credentialId, input.username ?? null]
    );
    const user = passkeyResult.rows[0];
    if (!user || user.disabled_at) {
      req.log?.warn("passkey login failed", { username: input.username, reason: "unknown_credential" });
      throw new HttpError(401, "Invalid passkey");
    }

    const challengeResult = await pool.query(
      `update passkey_challenges
       set consumed_at = now()
       where challenge_hash = $1 and type = 'authentication' and consumed_at is null and expires_at > now()
         and (user_id is null or user_id = $2)
       returning id`,
      [sha256(input.challenge), user.id]
    );
    if (!challengeResult.rows[0]) {
      req.log?.warn("passkey login failed", { userId: user.id, username: user.username, reason: "invalid_challenge" });
      throw new HttpError(400, "Invalid or expired passkey login challenge");
    }

    await pool.query("update passkeys set last_used_at = now(), counter = counter + 1 where id = $1", [user.passkey_id]);
    const session = await createSession(pool, user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    req.log?.info("passkey login succeeded", { userId: user.id, username: user.username });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
