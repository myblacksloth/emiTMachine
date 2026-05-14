import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { createSession, setSessionCookie } from "../services/sessions.js";
import { sha256 } from "../utils/crypto.js";
import { usernameSchema } from "../utils/validators.js";

const router = Router();

// ── Registration ─────────────────────────────────────────────────────────────

router.post("/register/options", requireAuth, async (req, res, next) => {
  try {
    const existingPasskeys = await pool.query(
      "select credential_id, transports from passkeys where user_id = $1",
      [req.user!.id]
    );

    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpId,
      userName: req.user!.username,
      userID: new TextEncoder().encode(req.user!.id),
      userDisplayName: req.user!.displayName ?? req.user!.username,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred"
      },
      excludeCredentials: existingPasskeys.rows.map((p) => ({
        id: p.credential_id,
        transports: p.transports ?? []
      }))
    });

    await pool.query(
      `insert into webauthn_challenges (user_id, challenge, challenge_hash, type)
       values ($1, $2, $3, 'registration')`,
      [req.user!.id, options.challenge, sha256(options.challenge)]
    );

    req.log?.info("passkey registration challenge created", {
      userId: req.user!.id,
      username: req.user!.username
    });
    res.json(options);
  } catch (error) {
    next(error);
  }
});

router.post("/register/verify", requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({
        label: z.string().trim().min(1).max(120).optional(),
        response: z.record(z.unknown())
      })
      .parse(req.body);

    const challengeResult = await pool.query(
      `with latest as (
         select id from webauthn_challenges
         where user_id = $1 and type = 'registration' and consumed_at is null and expires_at > now()
         order by created_at desc
         limit 1
       )
       update webauthn_challenges
       set consumed_at = now()
       from latest
       where webauthn_challenges.id = latest.id
       returning webauthn_challenges.challenge`,
      [req.user!.id]
    );

    if (!challengeResult.rows[0]) {
      throw new HttpError(400, "No valid registration challenge found — please try again");
    }

    const verification = await verifyRegistrationResponse({
      response: input.response as RegistrationResponseJSON,
      expectedChallenge: challengeResult.rows[0].challenge,
      expectedOrigin: config.rpOrigin,
      expectedRPID: config.rpId
    });

    if (!verification.verified || !verification.registrationInfo) {
      req.log?.warn("passkey registration verification failed", {
        userId: req.user!.id,
        username: req.user!.username
      });
      throw new HttpError(400, "Passkey registration could not be verified");
    }

    const { credential, aaguid } = verification.registrationInfo;

    await pool.query(
      `insert into passkeys
         (user_id, credential_id, public_key, public_key_cose, aaguid, counter, device_name, transports, backup_eligible, backup_state)
       values ($1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10)
       on conflict (credential_id) do update set
         device_name     = excluded.device_name,
         public_key_cose = excluded.public_key_cose,
         counter         = excluded.counter,
         updated_at      = now()`,
      [
        req.user!.id,
        credential.id,
        credential.id,
        Buffer.from(credential.publicKey),
        aaguid && aaguid !== "00000000-0000-0000-0000-000000000000" ? aaguid : null,
        credential.counter,
        input.label ?? "Passkey",
        credential.transports ?? [],
        verification.registrationInfo.credentialBackedUp ?? false,
        verification.registrationInfo.credentialBackedUp ?? false
      ]
    );

    req.log?.info("passkey registered", {
      userId: req.user!.id,
      username: req.user!.username,
      label: input.label ?? "Passkey",
      credentialId: credential.id
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ── Authentication ────────────────────────────────────────────────────────────

router.post("/login/options", async (req, res, next) => {
  try {
    const input = z.object({ username: usernameSchema.optional() }).parse(req.body);

    let userId: string | null = null;
    let allowCredentials: Array<{ id: string; transports: string[] }> = [];

    if (input.username) {
      const userResult = await pool.query(
        "select id from users where username = $1 and disabled_at is null",
        [input.username]
      );
      userId = userResult.rows[0]?.id ?? null;

      if (userId) {
        const passkeys = await pool.query(
          "select credential_id, transports from passkeys where user_id = $1",
          [userId]
        );
        allowCredentials = passkeys.rows.map((p) => ({
          id: p.credential_id,
          transports: p.transports ?? []
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      allowCredentials: allowCredentials.length ? allowCredentials : undefined,
      userVerification: "preferred"
    });

    await pool.query(
      `insert into webauthn_challenges (user_id, challenge, challenge_hash, type)
       values ($1, $2, $3, 'authentication')`,
      [userId, options.challenge, sha256(options.challenge)]
    );

    req.log?.info("passkey authentication challenge created", { username: input.username, userId });
    res.json(options);
  } catch (error) {
    next(error);
  }
});

router.post("/login/verify", async (req, res, next) => {
  try {
    const input = z
      .object({
        username: usernameSchema.optional(),
        response: z.record(z.unknown())
      })
      .parse(req.body);

    const authResponse = input.response as AuthenticationResponseJSON;
    const credentialId = authResponse.id;

    const passkeyResult = await pool.query(
      `select p.id as passkey_id, p.credential_id, p.public_key_cose, p.counter, p.transports,
              u.id as user_id, u.username, u.email, u.display_name, u.role, u.totp_enabled, u.disabled_at
       from passkeys p
       join users u on u.id = p.user_id
       where p.credential_id = $1 and ($2::citext is null or u.username = $2::citext)`,
      [credentialId, input.username ?? null]
    );

    const passkey = passkeyResult.rows[0];
    if (!passkey || passkey.disabled_at) {
      req.log?.warn("passkey login failed", { username: input.username, reason: "unknown_credential" });
      throw new HttpError(401, "Invalid passkey");
    }

    if (!passkey.public_key_cose) {
      req.log?.warn("passkey login failed", { userId: passkey.user_id, reason: "no_public_key" });
      throw new HttpError(401, "Passkey has no stored public key — please re-register this device");
    }

    // Extract challenge from clientDataJSON to find the matching DB record
    let storedChallenge: string;
    try {
      const clientData = JSON.parse(
        Buffer.from(authResponse.response.clientDataJSON, "base64url").toString("utf8")
      ) as { challenge: string };

      const challengeResult = await pool.query(
        `update webauthn_challenges
         set consumed_at = now()
         where challenge_hash = $1 and type = 'authentication'
           and consumed_at is null and expires_at > now()
           and (user_id is null or user_id = $2)
         returning challenge`,
        [sha256(clientData.challenge), passkey.user_id]
      );

      if (!challengeResult.rows[0]) {
        throw new HttpError(400, "Invalid or expired authentication challenge");
      }
      storedChallenge = challengeResult.rows[0].challenge;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, "Invalid authentication response format");
    }

    const verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge: storedChallenge,
      expectedOrigin: config.rpOrigin,
      expectedRPID: config.rpId,
      credential: {
        id: passkey.credential_id,
        publicKey: new Uint8Array(passkey.public_key_cose as Buffer),
        counter: Number(passkey.counter),
        transports: passkey.transports ?? []
      },
      requireUserVerification: false
    });

    if (!verification.verified) {
      req.log?.warn("passkey authentication failed", {
        userId: passkey.user_id,
        reason: "verification_failed"
      });
      throw new HttpError(401, "Passkey authentication failed");
    }

    await pool.query(
      "update passkeys set last_used_at = now(), counter = $2 where id = $1",
      [passkey.passkey_id, verification.authenticationInfo.newCounter]
    );

    const session = await createSession(pool, passkey.user_id);
    setSessionCookie(res, session.token, session.expiresAt);
    req.log?.info("passkey login succeeded", {
      userId: passkey.user_id,
      username: passkey.username,
      credentialId
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
