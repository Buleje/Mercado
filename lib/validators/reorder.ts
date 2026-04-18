/**
 * reorder.ts — Zod schemas para "Comprar de nuevo" desde historial.
 *
 * Regla CLAUDE.md #2: safeParse() siempre.
 * Stub documentado — no toca orders reales.
 */

import { z } from "zod";

export const ReorderSchema = z.object({
  originalOrderId: z.string().min(3).max(80),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        storeProductId: z.string().min(1),
        storeId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
        unitPrice: z.number().positive(),
      }),
    )
    .min(1)
    .max(50),
  // Si el customer quiere ajustar la dirección del original
  addressOverride: z
    .object({
      line1: z.string().min(5).max(200),
      reference: z.string().max(200).optional(),
    })
    .optional(),
});

export type ReorderInput = z.infer<typeof ReorderSchema>;
