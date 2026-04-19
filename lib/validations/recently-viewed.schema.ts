/**
 * Zod schema for the `buleje-recently-viewed` localStorage entry.
 *
 * Blinda contra datos legacy (price como string, entries sin id, array no-array).
 * Regla CLAUDE.md #2: siempre safeParse(), nunca .parse().
 *
 * Usage:
 *   const parsed = RecentlyViewedArraySchema.safeParse(JSON.parse(raw));
 *   return parsed.success ? parsed.data : [];
 */

import { z } from "zod";

export const RecentlyViewedEntrySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  category: z.string().default(""),
  price: z.coerce.number().nonnegative().default(0),
  image: z.string().default(""),
  unit: z.string().default(""),
  badge: z.string().optional(),
  description: z.string().optional(),
  stock: z.number().int().nonnegative().optional(),
});

export const RecentlyViewedArraySchema = z
  .array(z.unknown())
  .transform((arr) =>
    arr
      .map((item) => RecentlyViewedEntrySchema.safeParse(item))
      .filter((r): r is { success: true; data: z.infer<typeof RecentlyViewedEntrySchema> } => r.success)
      .map((r) => r.data),
  );

export type RecentlyViewedEntry = z.infer<typeof RecentlyViewedEntrySchema>;
