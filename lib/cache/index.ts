/**
 * lib/cache/index.ts
 *
 * Barrel de los helpers de caché del proyecto.
 * Centraliza imports para que los consumidores no importen de sub-paths.
 *
 * Uso:
 *   import { withMediumCache, invalidateTenantCache } from "@/lib/cache";
 *
 * NOTA: getOrSet, invalidate, invalidateByPrefix, invalidateAll siguen
 * disponibles en "@/lib/cache" (lib/cache.ts) — este barrel no los shadea.
 */

export {
  withCache,
  withShortCache,
  withMediumCache,
  withLongCache,
  invalidate,
  invalidateByPrefix,
} from "./cache-wrapper";

export {
  invalidateSettingsCache,
  invalidateProductsCache,
  invalidateProductRatingsCache,
  invalidateMarketplaceCatalogCache,
  invalidateTenantCache,
} from "./invalidation";
