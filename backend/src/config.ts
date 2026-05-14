import "dotenv/config";

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
  totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY
};
