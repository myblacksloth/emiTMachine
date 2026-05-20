import { Router } from "express";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { assertTagsAreCompatible } from "../services/tags.js";
import { isoDateTimeSchema } from "../utils/validators.js";

const router = Router();

const importRowSchema = z.object({
  event_type: z.enum(["clock_in", "clock_out"]),
  occurred_at: isoDateTimeSchema,
  timezone: z.string().trim().min(1).max(80),
  session_external_id: z.string().trim().min(1).max(120),
  tags: z.string().optional().default(""),
  note: z.string().optional().default("")
});

router.use(requireAuth);

router.get("/export", async (req, res, next) => {
  try {
    const result = await pool.query(
      `select e.event_type, e.occurred_at, e.timezone, s.id as session_external_id,
              string_agg(t.name, '|') as tags, e.note
       from time_events e
       join time_sessions s on s.id = e.session_id
       left join session_tags st on st.session_id = s.id
       left join tags t on t.id = st.tag_id
       where e.user_id = $1
       group by e.id, s.id
       order by e.occurred_at asc`,
      [req.user!.id]
    );

    const csv = stringify(result.rows, {
      header: true,
      columns: ["event_type", "occurred_at", "timezone", "session_external_id", "tags", "note"]
    });

    res.header("Content-Type", "text/csv; charset=utf-8");
    res.header("Content-Disposition", `attachment; filename="emitmachine-export.csv"`);
    req.log?.info("csv exported", { userId: req.user!.id, rows: result.rowCount });
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.post("/import/preview", async (req, res, next) => {
  try {
    const csvText = z.object({ csv: z.string().min(1) }).parse(req.body).csv;
    const rows = parse(csvText, { columns: true, skip_empty_lines: true });
    const preview = rows.map((row: unknown, index: number) => {
      const parsed = importRowSchema.safeParse(row);
      return { rowNumber: index + 2, valid: parsed.success, data: parsed.success ? parsed.data : row, errors: parsed.success ? [] : parsed.error.issues };
    });
    req.log?.info("csv import previewed", {
      userId: req.user!.id,
      validRows: preview.filter((row) => row.valid).length,
      invalidRows: preview.filter((row) => !row.valid).length
    });
    res.json({ rows: preview, validRows: preview.filter((row) => row.valid).length, invalidRows: preview.filter((row) => !row.valid).length });
  } catch (error) {
    next(error);
  }
});

router.post("/import", async (req, res, next) => {
  try {
    const csvText = z.object({ csv: z.string().min(1) }).parse(req.body).csv;
    const rows = parse(csvText, { columns: true, skip_empty_lines: true }).map((row: unknown) => importRowSchema.parse(row));

    const result = await withTransaction(async (client) => {
      const importResult = await client.query("insert into csv_imports (user_id, row_count) values ($1, $2) returning id", [req.user!.id, rows.length]);
      const importId = importResult.rows[0].id;
      const sessions = new Map<string, string>();
      let importedEvents = 0;

      for (const row of rows) {
        let sessionId = sessions.get(row.session_external_id);
        if (!sessionId && row.event_type === "clock_in") {
          const tagNames = row.tags.split("|").map((tag) => tag.trim()).filter(Boolean);
          let tagIds: string[] = [];
          if (tagNames.length > 0) {
            const tagRows = await client.query("select id from tags where user_id = $1 and lower(name) = any($2::text[])", [
                req.user!.id,
                tagNames.map((name) => name.toLowerCase())
              ]);
            if (tagRows.rowCount !== tagNames.length) {
              throw new HttpError(400, `Unknown tag in CSV session ${row.session_external_id}`);
            }
            tagIds = tagRows.rows.map((tag: { id: string }) => tag.id);
            await assertTagsAreCompatible(client, req.user!.id, tagIds);
          }

          const sessionResult = await client.query(
            `insert into time_sessions (user_id, started_at, start_timezone, note, source, csv_import_id)
             values ($1, $2, $3, $4, 'csv_import', $5)
             returning id`,
            [req.user!.id, row.occurred_at, row.timezone, row.note || null, importId]
          );
          sessionId = sessionResult.rows[0].id;
          sessions.set(row.session_external_id, sessionId);
          for (const tagId of tagIds) {
            await client.query("insert into session_tags (session_id, tag_id) values ($1, $2)", [sessionId, tagId]);
          }
        }

        if (!sessionId) {
          throw new HttpError(400, `CSV row for session ${row.session_external_id} must include clock_in before clock_out`);
        }

        if (row.event_type === "clock_out") {
          await client.query(
            `update time_sessions
             set ended_at = $3, end_timezone = $4, updated_at = now()
             where id = $1 and user_id = $2`,
            [sessionId, req.user!.id, row.occurred_at, row.timezone]
          );
        }

        await client.query(
          `insert into time_events (user_id, session_id, event_type, occurred_at, timezone, note, source, csv_import_id)
           values ($1, $2, $3, $4, $5, $6, 'csv_import', $7)`,
          [req.user!.id, sessionId, row.event_type, row.occurred_at, row.timezone, row.note || null, importId]
        );
        importedEvents += 1;
      }

      await client.query("update csv_imports set imported_event_count = $2 where id = $1", [importId, importedEvents]);
      return { importId, importedEvents };
    });

    req.log?.info("csv imported", { userId: req.user!.id, importId: result.importId, importedEvents: result.importedEvents });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
