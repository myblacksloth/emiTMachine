import type { NextFunction, Request, Response } from "express";
import { logger, sanitizeError } from "./utils/logger.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "Route not found"));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestLog = req.log ?? logger.child({ requestId: req.requestId, correlationId: req.correlationId });

  if (error instanceof HttpError) {
    const fields = {
      method: req.method,
      path: req.path,
      statusCode: error.status,
      userId: req.user?.id,
      error: sanitizeError(error)
    };
    if (error.status === 401 && req.path === "/me" && error.message === "Authentication required") {
      requestLog.debug("anonymous session check", fields);
    } else if (error.status >= 500) requestLog.error("http error", fields);
    else requestLog.warn("http error", fields);
    return res.status(error.status).json({ error: error.message, details: error.details });
  }

  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: unknown }).issues;
    requestLog.warn("request validation failed", {
      method: req.method,
      path: req.path,
      statusCode: 400,
      userId: req.user?.id,
      issueCount: Array.isArray(issues) ? issues.length : undefined,
      error: sanitizeError(error)
    });
    return res.status(400).json({ error: "Invalid request payload", details: (error as { issues: unknown }).issues });
  }

  const pgCode = error && typeof error === "object" && "code" in error ? (error as { code: string }).code : null;
  const pgConstraint = error && typeof error === "object" && "constraint" in error ? (error as { constraint: string }).constraint : "";

  if (pgCode === "23P01") {
    const message =
      pgConstraint === "time_sessions_no_overlap"
        ? "The selected time overlaps an existing work session"
        : "A conflict prevented this operation";
    requestLog.warn("database exclusion conflict", {
      method: req.method,
      path: req.path,
      statusCode: 409,
      userId: req.user?.id,
      constraint: pgConstraint
    });
    return res.status(409).json({ error: message });
  }

  requestLog.error("unhandled error", {
    method: req.method,
    path: req.path,
    statusCode: 500,
    userId: req.user?.id,
    error: sanitizeError(error)
  });
  return res.status(500).json({ error: "Internal server error" });
}
