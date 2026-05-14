import "dotenv/config";

const logLevels = ["error", "warn", "info", "debug", "trace"] as const;
const logFormats = ["json", "pretty"] as const;

type LogLevel = (typeof logLevels)[number];
type LogFormat = (typeof logFormats)[number];

function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.toLowerCase();
  return logLevels.includes(normalized as LogLevel) ? (normalized as LogLevel) : "info";
}

function parseLogFormat(value: string | undefined): LogFormat {
  const normalized = value?.toLowerCase();
  return logFormats.includes(normalized as LogFormat) ? (normalized as LogFormat) : "pretty";
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://emitmachine:emitmachine@localhost:5432/emitmachine",
  cookieName: process.env.COOKIE_NAME ?? "emitmachine_session",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
  rpId: process.env.RP_ID ?? "localhost",
  rpName: process.env.RP_NAME ?? "emiTMachine",
  totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY,
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
  logFormat: parseLogFormat(process.env.LOG_FORMAT)
};
