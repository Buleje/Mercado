/**
 * one-click.ts — Zod schemas para One-Click Buy (Amazon-style shortcut).
 *
 * Regla CLAUDE.md #2: safeParse() siempre.
 * Regla zona peligro: NO toca orders reales. Es un stub documentado.
 */

import { z } from "zod";

/** Payload del POST a `/api/one-click/create` */
export const OneClickOrderSchema = z.object({
  productId: z.number().int().positive(),
  storeId: z.string().min(1),
  storeProductId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  unitPrice: z.number().positive(),
  // Dirección predeterminada (snapshot, editable en modal)
  address: z.object({
    label: z.string().min(1).max(60),
    line1: z.string().min(5).max(200),
    reference: z.string().max(200).optional(),
  }),
  // Método de pago (mock — no se procesa)
  paymentMethod: z.enum(["yape", "plin", "cash"]),
  // Notas opcionales
  notes: z.string().max(400).optional(),
});

export type OneClickOrderInput = z.infer<typeof OneClickOrderSchema>;
