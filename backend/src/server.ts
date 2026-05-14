import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

const app = createApp();

process.on("unhandledRejection", (error) => {
  logger.error("unhandled promise rejection", { error });
});

process.on("uncaughtException", (error) => {
  logger.error("uncaught exception", { error });
  process.exitCode = 1;
});

app.listen(config.port, () => {
  logger.info("backend listening", {
    port: config.port,
    logLevel: config.logLevel,
    logFormat: config.logFormat
  });
});
