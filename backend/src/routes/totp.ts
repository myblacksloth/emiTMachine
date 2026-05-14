import { Router } from "express";
import QRCode from "qrcode";
import speakeasy from "speakeasy";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { decryptTotpSecret, encryptTotpSecret } from "../utils/crypto.js";

const router = Router();

router.post("/setup", requireAuth, async (req, res, next) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `${config.rpName}:${req.user!.email}`,
      issuer: config.rpName,
      length: 32
    });

    await pool.query("update users set totp_secret = $1, totp_enabled = false where id = $2", [encryptTotpSecret(secret.base32), req.user!.id]);
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);
    res.json({ secret: secret.base32, otpauthUrl: secret.otpauth_url, qrCodeDataUrl });
  } catch (error) {
    next(error);
  }
});

router.post("/verify", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ code: z.string().trim().min(6).max(8) }).parse(req.body);
    const result = await pool.query("select totp_secret from users where id = $1", [req.user!.id]);
    const secret = result.rows[0]?.totp_secret;
    if (!secret) {
      throw new HttpError(400, "TOTP setup has not been started");
    }

    const valid = speakeasy.totp.verify({
      secret: decryptTotpSecret(secret),
      encoding: "base32",
      token: input.code,
      window: 1
    });

    if (!valid) {
      throw new HttpError(400, "Invalid TOTP code");
    }

    await pool.query("update users set totp_enabled = true where id = $1", [req.user!.id]);
    res.json({ totpEnabled: true });
  } catch (error) {
    next(error);
  }
});

router.delete("/", requireAuth, async (req, res, next) => {
  try {
    await pool.query("update users set totp_secret = null, totp_enabled = false where id = $1", [req.user!.id]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
