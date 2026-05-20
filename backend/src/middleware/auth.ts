import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { sha256 } from "../utils/crypto.js";

export type AuthUser = {
  id: string;
  publicId?: string;
  username: string;
  email?: string | null;
  displayName: string;
  role: "user" | "admin" | "root";
  adminApproved: boolean;
  canEditSessions: boolean;
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
      `select s.id as session_id, u.id, u.public_id, u.username, u.email, u.display_name, u.role, u.admin_approved, u.can_edit_sessions, u.totp_enabled
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
      publicId: row.public_id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      adminApproved: Boolean(row.admin_approved),
      canEditSessions: Boolean(row.can_edit_sessions),
      totpEnabled: Boolean(row.totp_enabled)
    };
    next();
  } catch (error) {
    next(error);
  }
}
