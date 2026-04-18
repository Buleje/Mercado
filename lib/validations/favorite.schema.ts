/**
 * Zod schemas for Favorites (Ola 1 — Retención Marketplace).
 * Cubre el endpoint DB-backed que reemplazará al localStorage actual.
 *
 * Usage:
 *   const parsed = AddFavoriteSchema.safeParse(await req.json());
 *   if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
 *
 * Spec: docs/superpowers/specs/2026-04-13-ola1-compra-recurrente-design.md
 * ADR:  docs/adr/059-ola1-marketplace-retention.md (pendiente crear)
 */

import { z } from "zod";

export const AddFavoriteSchema = z.object({
  productId: z.number().int().positive(),
  storeId: z.string().min(1),
});

export const CheckFavoritesSchema = z.object({
  productIds: z
    .string()
    .regex(/^\d+(,\d+)*$/, "Comma-separated integers required"),
});

export type AddFavoriteInput = z.infer<typeof AddFavoriteSchema>;
export type CheckFavoritesInput = z.infer<typeof CheckFavoritesSchema>;
