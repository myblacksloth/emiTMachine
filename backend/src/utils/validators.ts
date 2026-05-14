import { z } from "zod";

export const emailSchema = z.string().email().trim().toLowerCase();
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]{2,31}$/, "Use 3-32 letters, numbers, dots, hyphens, or underscores.");
export const passwordSchema = z.string().min(8).max(200);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  tagId: uuidSchema.optional()
});
