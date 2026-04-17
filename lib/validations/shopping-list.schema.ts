/**
 * Zod schemas for Shopping Lists (Ola 1 — Retención Marketplace).
 * Permite al cliente guardar listas de compra recurrentes ("Compra de la semana",
 * "Productos del negocio", etc.) y reutilizarlas como carrito pre-llenado.
 *
 * Naming: mantiene español para UX ("Mi lista de compras"), inglés en código.
 *
 * Spec: docs/superpowers/specs/2026-04-13-ola1-compra-recurrente-design.md
 */

import { z } from "zod";

export const CreateShoppingListSchema = z.object({
  name: z.string().min(1).max(50).trim(),
});

export const UpdateShoppingListSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  isDefault: z.boolean().optional(),
});

export const AddShoppingListItemSchema = z.object({
  productId: z.number().int().positive(),
  storeId: z.string().min(1).nullish(),
  quantity: z.number().int().min(1).max(99).default(1),
  notes: z.string().max(200).trim().nullish(),
});

export const UpdateShoppingListItemSchema = z.object({
  quantity: z.number().int().min(1).max(99).optional(),
  notes: z.string().max(200).trim().nullish(),
  sortOrder: z.number().int().min(0).optional(),
});

export type CreateShoppingListInput = z.infer<typeof CreateShoppingListSchema>;
export type UpdateShoppingListInput = z.infer<typeof UpdateShoppingListSchema>;
export type AddShoppingListItemInput = z.infer<typeof AddShoppingListItemSchema>;
export type UpdateShoppingListItemInput = z.infer<typeof UpdateShoppingListItemSchema>;
