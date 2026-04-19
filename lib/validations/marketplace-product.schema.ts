/**
 * Zod schema del contrato público de `/api/marketplace/products/[id]`.
 *
 * El shape corresponde al `ApiProduct` que consume
 * `app/marketplace/[slug]/producto/[productId]/page.tsx` (PDP). Cambiar el
 * response del endpoint rompe el cliente — este schema es el **contrato**.
 *
 * Regla CLAUDE.md #2: siempre `.safeParse()`. Usar este schema tanto en:
 *   - Tests de contrato del endpoint (validación del response real).
 *   - PDP server component (validación defensiva al deserializar).
 */

import { z } from "zod";

export const MarketplaceProductImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  alt: z.string().nullable(),
  isPrimary: z.boolean(),
});

export const MarketplaceProductVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  priceModifier: z.coerce.number(),
  stock: z.number().int().nullable(),
  attributesJson: z.unknown().nullable(),
});

export const MarketplaceProductStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable(),
  description: z.string().nullable(),
  zone: z.string().nullable(),
});

export const MarketplaceProductSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().nullable(),
  price: z.coerce.number().nonnegative(),
  wholesalePrice: z.coerce.number().nullable(),
  unit: z.string().nullable(),
  badge: z.string().nullable(),
  stock: z.number().int().nullable(),
  image: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  ogImage: z.string().nullable(),
  images: z.array(MarketplaceProductImageSchema),
  storeProductId: z.string(),
  minOrderQty: z.number().int().positive(),
  store: MarketplaceProductStoreSchema,
});

export const MarketplaceProductResponseSchema = z.object({
  data: MarketplaceProductSchema.nullable(),
});

export type MarketplaceProduct = z.infer<typeof MarketplaceProductSchema>;
export type MarketplaceProductResponse = z.infer<typeof MarketplaceProductResponseSchema>;
