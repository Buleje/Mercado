import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * lib/db/marketplace-compare.db.ts
 *
 * Helpers para la página /marketplace/comparar.
 * Resuelve un set de productIds → datos completos para comparación side-by-side.
 *
 * Convenciones ADR-011:
 *   - `tenantId` 1er param (aunque el marketplace es global, lo pasamos para
 *     preparar multi-tenant cuando cada tienda tenga su propio ns).
 *   - Cache getOrSet con TTL corto (60s) — data pública, cambia poco.
 *   - Logger estructurado.
 *
 * La data la sirve públicamente, así que NUNCA exponemos tenantId ni phones.
 */

export type CompareProductData = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  wholesalePrice: number | null;
  unit: string | null;
  badge: string | null;
  stock: number | null;
  image: string;
  storeProductId: string;
  minOrderQty: number;
  store: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
};

export const MarketplaceCompareDB = {
  /**
   * Devuelve un producto por id con su tienda activa.
   * Fallback a null si no existe o está inactivo.
   */
  async getProductsForCompare(
    tenantId: string,
    ids: number[],
  ): Promise<CompareProductData[]> {
    if (ids.length === 0) return [];

    const cacheKey = `marketplace:compare:${tenantId}:${ids.sort((a, b) => a - b).join(",")}`;
    return getOrSet(cacheKey, 60, async () => {
      try {
        const products = await prisma.product.findMany({
          where: {
            id: { in: ids },
            active: true,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            price: true,
            image: true,
            unit: true,
            badge: true,
            stock: true,
            storeProducts: {
              where: { isActive: true, store: { isPublished: true } },
              take: 1,
              select: {
                id: true,
                retailPrice: true,
                wholesalePrice: true,
                minOrderQty: true,
                store: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    logo: true,
                  },
                },
              },
            },
          },
        });

        const rows: CompareProductData[] = [];
        for (const p of products) {
          const sp = p.storeProducts[0];
          if (!sp) continue;
          rows.push({
            id: p.id,
            name: p.name,
            description: p.description,
            category: p.category,
            price: Number(sp.retailPrice),
            wholesalePrice: sp.wholesalePrice ? Number(sp.wholesalePrice) : null,
            unit: p.unit,
            badge: p.badge,
            stock: p.stock,
            image: p.image ?? "",
            storeProductId: sp.id,
            minOrderQty: sp.minOrderQty,
            store: {
              id: sp.store.id,
              name: sp.store.name,
              slug: sp.store.slug,
              logo: sp.store.logo,
            },
          });
        }
        // Preservar el orden solicitado por ids[]
        const byId = new Map(rows.map((r) => [r.id, r]));
        return ids.map((id) => byId.get(id)).filter(Boolean) as CompareProductData[];
      } catch (err) {
        logger.error("[MarketplaceCompareDB.getProductsForCompare] failed", {
          err: String(err),
          ids,
        });
        return [];
      }
    });
  },
};
