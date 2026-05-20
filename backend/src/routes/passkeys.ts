import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON
} from "@simplewebauthn/server";
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
const challengeTtlMs = 10 * 60 * 1000;

const registrationResponseSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1).optional(),
    response: z.object({
      clientDataJSON: z.string().min(1)
    }).passthrough()
  })
  .passthrough();

const authenticationResponseSchema = registrationResponseSchema;

function decodeClientChallenge(response: RegistrationResponseJSON | AuthenticationResponseJSON) {
  try {
    const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")) as {
      challenge?: unknown;
    };
    if (typeof clientData.challenge !== "string" || clientData.challenge.length === 0) {
      throw new Error("missing challenge");
    }
    return clientData.challenge;
  } catch {
    throw new HttpError(400, "Invalid WebAuthn response format");
  }
}

function toTransports(value: unknown): AuthenticatorTransportFuture[] {
  return Array.isArray(value)
    ? value.filter((transport): transport is AuthenticatorTransportFuture => typeof transport === "string")
    : [];
}

async function storeChallenge(userId: string | null, challenge: string, type: "registration" | "authentication") {
  await pool.query(
    `insert into passkey_challenges (user_id, challenge_hash, type, expires_at)
     values ($1, $2, $3, $4)`,
    [userId, sha256(challenge), type, new Date(Date.now() + challengeTtlMs)]
  );
}

async function consumeChallenge(userId: string | null, challenge: string, type: "registration" | "authentication") {
  const result = await pool.query(
    `update passkey_challenges
     set consumed_at = now()
     where id = (
       select id
       from passkey_challenges
       where challenge_hash = $1
         and type = $2
         and consumed_at is null
         and expires_at > now()
         and ($3::uuid is null or user_id is null or user_id = $3::uuid)
       order by created_at desc
       limit 1
     )
     returning id`,
    [sha256(challenge), type, userId]
  );

  if (!result.rows[0]) {
    throw new HttpError(400, "Invalid or expired passkey challenge");
  }
}

function publicUser(row: {
  user_id: string;
  public_id?: string;
  username: string;
  email?: string | null;
  display_name: string;
  role: string;
  admin_approved?: boolean;
  can_edit_sessions?: boolean;
  totp_enabled?: boolean;
}) {
  return {
    id: row.user_id,
    publicId: row.public_id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    adminApproved: row.admin_approved ?? true,
    canEditSessions: row.can_edit_sessions ?? true,
    totpEnabled: Boolean(row.totp_enabled)
  };
}

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
        transports: toTransports(p.transports)
      }))
    });

    await storeChallenge(req.user!.id, options.challenge, "registration");

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
        label: z.preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
          z.string().trim().min(1).max(120).optional()
        ),
        response: z.record(z.unknown())
      })
      .parse(req.body);

    const response = registrationResponseSchema.parse(input.response) as RegistrationResponseJSON;
    const challenge = decodeClientChallenge(response);
    await consumeChallenge(req.user!.id, challenge, "registration");

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.rpOrigins,
      expectedRPID: config.rpId
    }).catch((error: unknown) => {
      req.log?.warn("passkey registration verification rejected", {
        userId: req.user!.id,
        username: req.user!.username,
        reason: error instanceof Error ? error.name : "unknown"
      });
      throw new HttpError(400, "Passkey registration could not be verified");
    });

    if (!verification.verified || !verification.registrationInfo) {
      req.log?.warn("passkey registration verification failed", {
        userId: req.user!.id,
        username: req.user!.username
      });
      throw new HttpError(400, "Passkey registration could not be verified");
    }

    const { credential, aaguid } = verification.registrationInfo;

    const insertResult = await pool.query(
      `insert into passkeys
         (user_id, credential_id, public_key, public_key_cose, aaguid, counter, device_name, transports, backup_eligible, backup_state)
       values ($1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10)
       on conflict (credential_id) do nothing
       returning id`,
      [
        req.user!.id,
        credential.id,
        Buffer.from(credential.publicKey).toString("base64url"),
        Buffer.from(credential.publicKey),
        aaguid && aaguid !== "00000000-0000-0000-0000-000000000000" ? aaguid : null,
        credential.counter,
        input.label ?? "Passkey",
        toTransports(credential.transports),
        verification.registrationInfo.credentialDeviceType === "multiDevice",
        verification.registrationInfo.credentialBackedUp ?? false
      ]
    );
    if (!insertResult.rows[0]) {
      throw new HttpError(409, "This passkey is already registered");
    }

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
    let allowCredentials: Array<{ id: string; transports: AuthenticatorTransportFuture[] }> = [];

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
          transports: toTransports(p.transports)
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      allowCredentials: allowCredentials.length ? allowCredentials : undefined,
      userVerification: "preferred"
    });

    await storeChallenge(userId, options.challenge, "authentication");

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

    const authResponse = authenticationResponseSchema.parse(input.response) as AuthenticationResponseJSON;
    const credentialId = authResponse.id;

    const passkeyResult = await pool.query(
      `select p.id as passkey_id, p.credential_id, p.public_key_cose, p.counter, p.transports,
              u.id as user_id, u.public_id, u.username, u.email, u.display_name, u.role, u.admin_approved, u.can_edit_sessions, u.totp_enabled, u.disabled_at
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
    if (passkey.role === "admin" && !passkey.admin_approved) {
      req.log?.warn("passkey login failed", { userId: passkey.user_id, username: passkey.username, reason: "admin_pending_approval" });
      throw new HttpError(403, "Admin account is waiting for root approval");
    }

    if (!passkey.public_key_cose) {
      req.log?.warn("passkey login failed", { userId: passkey.user_id, reason: "no_public_key" });
      throw new HttpError(401, "Passkey has no stored public key — please re-register this device");
    }

    const challenge = decodeClientChallenge(authResponse);
    await consumeChallenge(passkey.user_id, challenge, "authentication");

    const verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge: challenge,
      expectedOrigin: config.rpOrigins,
      expectedRPID: config.rpId,
      credential: {
        id: passkey.credential_id,
        publicKey: new Uint8Array(passkey.public_key_cose as Buffer),
        counter: Number(passkey.counter),
        transports: toTransports(passkey.transports)
      },
      requireUserVerification: false
    }).catch((error: unknown) => {
      req.log?.warn("passkey authentication rejected", {
        userId: passkey.user_id,
        username: passkey.username,
        reason: error instanceof Error ? error.name : "unknown"
      });
      throw new HttpError(401, "Passkey authentication failed");
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
    res.json({ ok: true, user: publicUser(passkey) });
  } catch (error) {
    next(error);
  }
});

export default router;
