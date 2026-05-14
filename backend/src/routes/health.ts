import { Router } from "express";
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

export default router;
