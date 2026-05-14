import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { sha256 } from "../utils/crypto.js";

export type AuthUser = {
  id: string;
  username: string;
  email?: string | null;
  displayName: string;
  role: string;
  totpEnabled: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) {
      throw new HttpError(401, "Authentication required");
    }

    const tokenHash = sha256(token);
    const result = await pool.query(
      `select s.id as session_id, u.id, u.username, u.email, u.display_name, u.role, u.totp_enabled
       from app_sessions s
       join users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now() and s.revoked_at is null and u.disabled_at is null`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) {
      throw new HttpError(401, "Authentication required");
    }

    req.sessionId = row.session_id;
    req.user = {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      totpEnabled: Boolean(row.totp_enabled)
    };
    next();
  } catch (error) {
    next(error);
  }
}
