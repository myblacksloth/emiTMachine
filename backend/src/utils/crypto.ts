import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { HttpError } from "../errors.js";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function generateRecoveryCode() {
  const first = crypto.randomBytes(4).toString("hex").toUpperCase();
  const second = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${first}-${second}`;
}

function totpKey() {
  if (!config.totpEncryptionKey) {
    throw new HttpError(500, "TOTP encryption key is not configured");
  }

  const raw = Buffer.from(config.totpEncryptionKey, "base64");
  if (raw.length === 32) {
    return raw;
  }

  const hex = Buffer.from(config.totpEncryptionKey, "hex");
  if (hex.length === 32) {
    return hex;
  }

  throw new HttpError(500, "TOTP encryption key must be 32 bytes in base64 or hex");
}

export function encryptTotpSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", totpKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptTotpSecret(value: string) {
  if (!value.startsWith("enc:v1:")) {
    return value;
  }

  const [, , ivRaw, tagRaw, ciphertextRaw] = value.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", totpKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}
