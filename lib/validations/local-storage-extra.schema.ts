/**
 * Zod schemas para claves de localStorage client-side que no son "productos
 * recientemente vistos". Útiles para LocalStorageDoctor.
 */

import { z } from "zod";

/**
 * buleje-selling-fast — tracker de "selling fast" (U4).
 * Shape: { [productId: string]: number[] }  (timestamps epoch ms, ventana 24h)
 */
export const SellingFastSchema = z
  .record(z.string(), z.array(z.number().int().nonnegative()))
  .catch({});

/**
 * buleje-compare — lista de productIds para comparar (max 3).
 * Shape: { items: Product[] } o number[] — aceptamos ambos, convertimos a []
 * si inválido.
 */
export const CompareStoreSchema = z
  .union([
    z.array(z.number().int().positive()),
    z.object({ items: z.array(z.unknown()).max(10) }),
  ])
  .catch([]);

/**
 * marketplace:recent-viewed:v1 — historial de productos vistos del marketplace
 * multi-tenant. Cada entry conoce su store (storeSlug/storeName) para el link
 * de retorno. price SIEMPRE se coerciona a number para no romper .toFixed.
 */
export const MarketplaceRecentViewedEntrySchema = z.object({
  productId: z.number().int().positive(),
  storeSlug: z.string().min(1),
  storeName: z.string().default(""),
  name: z.string().min(1),
  price: z.coerce.number().nonnegative().default(0),
  image: z.string().nullable().default(null),
  viewedAt: z.coerce.number().int().nonnegative().default(0),
});

export const MarketplaceRecentViewedArraySchema = z
  .array(z.unknown())
  .transform((arr) =>
    arr
      .map((item) => MarketplaceRecentViewedEntrySchema.safeParse(item))
      .filter((r): r is { success: true; data: z.infer<typeof MarketplaceRecentViewedEntrySchema> } => r.success)
      .map((r) => r.data),
  );

export type MarketplaceRecentViewedEntry = z.infer<typeof MarketplaceRecentViewedEntrySchema>;
