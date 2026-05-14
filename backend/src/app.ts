import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { errorHandler, notFound } from "./errors.js";
import authRoutes from "./routes/auth.js";
import csvRoutes from "./routes/csv.js";
import healthRoutes from "./routes/health.js";
import passkeyRoutes from "./routes/passkeys.js";
import profileRoutes from "./routes/profile.js";
import punchRoutes from "./routes/punch.js";
import recoveryRoutes from "./routes/recovery.js";
import reportRoutes from "./routes/reports.js";
import tagRoutes from "./routes/tags.js";
import totpRoutes from "./routes/totp.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

  app.use("/health", healthRoutes);
  app.use("/api/health", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/auth/totp", totpRoutes);
  app.use("/api/auth/recovery", recoveryRoutes);
  app.use("/api/auth/passkeys", passkeyRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/punch", punchRoutes);
  app.use("/api/tags", tagRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/csv", csvRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
