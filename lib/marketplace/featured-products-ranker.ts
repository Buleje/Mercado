import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Beneficio "Productos destacados" (superadmin > Beneficios).
 *
 * Las tiendas con `Store.benefits.featuredProducts = true` reciben:
 *   - badge "featured" ("Destacado") en sus productos del catálogo/búsqueda
 *   - boost de orden: sus productos suben (después de los sponsored pagados,
 *     antes de los orgánicos). Partición ESTABLE — no reordena dentro de cada
 *     grupo, así que el orden por precio/rating/distancia se preserva.
 *
 * El flag vive en la columna jsonb `benefits` (fuera de schema.prisma — zona
 * peligrosa), por eso se lee vía raw SQL parametrizado. Fail-safe: si la query
 * falla, devuelve los productos sin tocar (degradación silenciosa).
 */
export async function applyFeaturedStoreBoost<
  T extends { storeId: string; badges?: string[] },
>(products: T[]): Promise<T[]> {
  if (products.length === 0) return products;

  const storeIds = [...new Set(products.map((p) => p.storeId))];
  let featuredStoreIds = new Set<string>();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "Store"
       WHERE id = ANY($1::text[])
         AND COALESCE((benefits->>'featuredProducts')::boolean, false) = true`,
      storeIds,
    );
    featuredStoreIds = new Set(rows.map((r) => r.id));
  } catch {
    return products; // sin beneficio → orden orgánico intacto
  }

  if (featuredStoreIds.size === 0) return products;

  const featured: T[] = [];
  const organic: T[] = [];
  for (const p of products) {
    if (featuredStoreIds.has(p.storeId)) {
      const badges = p.badges ? [...p.badges] : [];
      if (!badges.includes("featured")) badges.push("featured");
      featured.push({ ...p, badges });
    } else {
      organic.push(p);
    }
  }

  return [...featured, ...organic];
}
