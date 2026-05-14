import { Router } from "express";
import { config } from "../config.js";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/ready", async (_req, res, next) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ready" });
  } catch (error) {
    next(error);
  }
});

router.get("/diagnostics", async (req, res) => {
  req.log?.debug("diagnostics endpoint called");
  res.json({
    status: "ok",
    requestId: req.requestId,
    logLevel: config.logLevel,
    logFormat: config.logFormat,
    nodeEnv: config.nodeEnv
  });
});

export default router;
