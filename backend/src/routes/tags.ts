import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { uuidSchema } from "../utils/validators.js";

const router = Router();

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: colorSchema
});

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `select id, name, color, is_default, created_at, updated_at
       from tags
       where user_id = $1
       order by is_default desc, lower(name)`,
      [req.user!.id]
    );
    res.json({ tags: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = tagInputSchema.parse(req.body);
    const result = await pool.query(
      `insert into tags (user_id, name, color)
       values ($1, $2, $3)
       returning id, name, color, is_default, created_at, updated_at`,
      [req.user!.id, input.name, input.color]
    );
    res.status(201).json({ tag: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      next(new HttpError(409, "A tag with this name already exists"));
      return;
    }
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const input = tagInputSchema.partial().refine((value) => value.name || value.color, "At least one field is required").parse(req.body);
    const result = await pool.query(
      `update tags
       set name = coalesce($3, name), color = coalesce($4, color), updated_at = now()
       where id = $1 and user_id = $2
       returning id, name, color, is_default, created_at, updated_at`,
      [id, req.user!.id, input.name ?? null, input.color ?? null]
    );
    if (!result.rows[0]) {
      throw new HttpError(404, "Tag not found");
    }
    res.json({ tag: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const result = await pool.query("delete from tags where id = $1 and user_id = $2 and is_default = false", [id, req.user!.id]);
    if (result.rowCount === 0) {
      throw new HttpError(404, "Tag not found or cannot be deleted");
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
