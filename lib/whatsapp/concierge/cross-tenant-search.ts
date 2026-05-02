import "server-only";

import { MarketplaceSearchDB } from "@/lib/db/marketplace-search.db";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrossTenantProduct {
  productId: number;
  storeId: string;
  storeSlug: string;
  storeName: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  unit: string | null;
  category: string | null;
  rating: number;
  distanceKm?: number;
  hasModifiers: boolean;
}

export interface CrossTenantSearchOpts {
  query: string;
  limit?: number;
  customerLat?: number;
  customerLng?: number;
  category?: string;
}

// ─── Haversine ────────────────────────────────────────────────────────────────

/**
 * Returns straight-line distance in km between two lat/lng pairs.
 * Used to rank nearer stores first when customer location is known.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─── Store lat/lng lookup ─────────────────────────────────────────────────────

/**
 * Fetches lat/lng for a store slug from the Store table.
 * Returns null when the store has no geolocation set.
 *
 * Delegated to MarketplaceDB — we never call prisma directly (CLAUDE.md #1).
 * We reuse a short 5-minute cache since store locations rarely change.
 */
async function getStoreCoords(
  storeSlug: string,
): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = `cross-tenant-store-coords:${storeSlug}`;
  return getOrSet(cacheKey, 300, async () => {
    // MarketplaceSearchDB doesn't expose coords; import MarketplaceDB for this.
    const { MarketplaceStoresDB } = await import("@/lib/db/marketplace.db");
    try {
      const store = await MarketplaceStoresDB.getBySlug(storeSlug);
      // Store model may or may not have lat/lng — guard defensively
      const s = store as unknown as {
        lat?: number | null;
        lng?: number | null;
      };
      if (s.lat != null && s.lng != null) {
        return { lat: Number(s.lat), lng: Number(s.lng) };
      }
    } catch {
      // Store not found or field absent — not a fatal error
    }
    return null;
  });
}

// ─── Main search ──────────────────────────────────────────────────────────────

/**
 * Busca productos en TODOS los stores publicados del marketplace.
 *
 * Orden:
 *   - Con lat/lng del cliente → Haversine ASC, luego price ASC
 *   - Sin lat/lng             → rating DESC, luego price ASC
 *
 * Cache: 60 s por (query normalizada + category).
 * Fallback: array vacío — el caller decide qué mostrar.
 *
 * CLAUDE.md #1: usa MarketplaceSearchDB, nunca prisma directo.
 * CLAUDE.md #3: cross-tenant es intencional aquí (marketplace público),
 *   documentado con el mismo patrón que marketplace-search.db.ts.
 */
export async function searchProductsCrossTenant(
  opts: CrossTenantSearchOpts,
): Promise<CrossTenantProduct[]> {
  const { query, limit = 5, customerLat, customerLng, category } = opts;

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const cacheKey = `cross-tenant-search:${normalizedQuery}:${category ?? ""}`;

  const results = await getOrSet(cacheKey, 60, async () => {
    const searchResult = await MarketplaceSearchDB.search({
      q: normalizedQuery,
      ...(category ? { categories: [category] } : {}),
      // Request more than limit so we have room to sort after distance calc
      limit: limit * 4,
      offset: 0,
      sort: "rating",
    });

    return searchResult.products;
  });

  logger.info("cross-tenant-search", {
    query: normalizedQuery,
    category: category ?? null,
    results: results.length,
    hasLocation: customerLat != null && customerLng != null,
  });

  if (results.length === 0) return [];

  // ── Map to CrossTenantProduct ──────────────────────────────────────────────
  // MarketplaceSearchDB.search does not return per-product description or
  // modifierGroups. We mark description null and hasModifiers false here;
  // the product-query handler can enrich via StoreProductDB if needed.
  const mapped: CrossTenantProduct[] = results.map((p) => ({
    productId: p.productId,
    storeId: p.storeId,
    storeSlug: p.storeSlug,
    storeName: p.storeName,
    name: p.name,
    description: null,
    price: p.price,
    image: p.image,
    unit: p.unit,
    category: p.category,
    rating: p.storeRating,
    hasModifiers: false,
  }));

  // ── Sort: with location → Haversine + price; without → rating + price ─────
  if (customerLat != null && customerLng != null) {
    // Fetch store coords in parallel (cached individually)
    const coordResults = await Promise.allSettled(
      mapped.map((p) => getStoreCoords(p.storeSlug)),
    );

    const withDist = mapped.map((p, i) => {
      const coordResult = coordResults[i];
      const coords =
        coordResult.status === "fulfilled" ? coordResult.value : null;
      const distanceKm =
        coords != null
          ? haversineKm(customerLat, customerLng, coords.lat, coords.lng)
          : undefined;
      return { ...p, distanceKm };
    });

    withDist.sort((a, b) => {
      const distA = a.distanceKm ?? Infinity;
      const distB = b.distanceKm ?? Infinity;
      if (distA !== distB) return distA - distB;
      return a.price - b.price;
    });

    return withDist.slice(0, limit);
  }

  // No location: rating DESC, price ASC
  mapped.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.price - b.price;
  });

  return mapped.slice(0, limit);
}

// ─── WhatsApp message formatter ───────────────────────────────────────────────

function money(amount: number): string {
  return `S/${Number(amount).toFixed(2)}`;
}

/**
 * Formatea los resultados cross-tenant para el canal WhatsApp.
 * Muestra nombre, tienda, precio y le pide al cliente que responda 1, 2 o 3.
 */
export function formatCrossTenantResults(
  products: CrossTenantProduct[],
  query: string,
): string {
  if (products.length === 0) {
    return (
      `No encontré "*${query}*" en ninguna tienda del marketplace.\n\n` +
      `Intenta con otro término o escribe *ver categorías*.\n` +
      `_También puedes escribir *hablar con humano* para asistencia._`
    );
  }

  const lines = products.slice(0, 5).map((p, i) => {
    const distTag =
      p.distanceKm != null ? ` — 📍 ${Number(p.distanceKm).toFixed(1)} km` : "";
    return (
      `${i + 1}️⃣  *${p.name}*\n` +
      `   🏪 ${p.storeName}${distTag}\n` +
      `   💰 ${money(p.price)}${p.unit ? ` / ${p.unit}` : ""}`
    );
  });

  return (
    `🛍 *"${query}"* — encontré ${products.length > 5 ? "los mejores" : products.length} resultado${products.length !== 1 ? "s" : ""}:\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    lines.join("\n\n") +
    `\n━━━━━━━━━━━━━━━━━━━\n` +
    `_Responde *1*, *2* o *3* para agregar al carrito_\n` +
    `_O escribe *buscar [otro producto]* para seguir explorando_`
  );
}
