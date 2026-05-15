import type { NextFunction, Request, RequestHandler, Response } from "express";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
} as const;

type LogLevel = keyof typeof levels;
type LogFields = Record<string, unknown>;

export type Logger = {
  error: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  debug: (message: string, fields?: LogFields) => void;
  trace: (message: string, fields?: LogFields) => void;
  child: (fields: LogFields) => Logger;
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      correlationId?: string;
      log?: Logger;
    }
  }
}

function shouldLog(level: LogLevel) {
  return levels[level] <= levels[config.logLevel];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: config.nodeEnv === "production" ? undefined : error.stack
    };
  }

  if (isRecord(error)) {
    return {
      name: typeof error.name === "string" ? error.name : undefined,
      message: typeof error.message === "string" ? error.message : "Unknown error"
    };
  }

  return { message: String(error) };
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Error) return sanitizeError(value);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  }
  return value;
}

function write(level: LogLevel, message: string, fields: LogFields) {
  if (!shouldLog(level)) return;

  const normalizedFields = normalizeValue(fields) as LogFields;
  const record = normalizeValue({
    time: new Date().toISOString(),
    level,
    message,
    ...normalizedFields
  });

  const line =
    config.logFormat === "json"
      ? JSON.stringify(record)
      : `[${(record as { time: string }).time}] ${level.toUpperCase()} ${message} ${JSON.stringify(normalizedFields)}`;

  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

function createLogger(baseFields: LogFields = {}): Logger {
  return {
    error: (message, fields = {}) => write("error", message, { ...baseFields, ...fields }),
    warn: (message, fields = {}) => write("warn", message, { ...baseFields, ...fields }),
    info: (message, fields = {}) => write("info", message, { ...baseFields, ...fields }),
    debug: (message, fields = {}) => write("debug", message, { ...baseFields, ...fields }),
    trace: (message, fields = {}) => write("trace", message, { ...baseFields, ...fields }),
    child: (fields) => createLogger({ ...baseFields, ...fields })
  };
}

function firstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export const logger = createLogger();

export const requestLogger: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  req.requestId = firstHeaderValue(req.headers["x-request-id"]) ?? randomUUID();
  req.correlationId = firstHeaderValue(req.headers["x-correlation-id"]) ?? req.requestId;
  req.log = logger.child({
    requestId: req.requestId,
    correlationId: req.correlationId
  });

  res.setHeader("X-Request-Id", req.requestId);

  res.on("finish", () => {
    const statusCode = res.statusCode;
    const logLevel: LogLevel =
      statusCode === 401 && req.originalUrl === "/api/auth/me" ? "debug" : statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
    req.log?.[logLevel]("request completed", {
      method: req.method,
      path: req.originalUrl,
      statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.id
    });
  });

  next();
};
