import { z } from "zod";

export const emailSchema = z.string().email().trim().toLowerCase();
export const passwordSchema = z.string().min(10).max(200);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  tagId: uuidSchema.optional()
});
