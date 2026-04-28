import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Persistencia simple de orden de categorías por tienda.
 * Storage: lib/data/store-category-orders.json (mismo patrón que
 * marketplace-categories.json — permitir editar sin migración de schema).
 *
 * Shape:
 *   { [storeSlug]: string[] }   // array ordenado de category ids
 *
 * Uso:
 *   - Admin del negocio (su tienda): usa el endpoint /api/admin/marketplace/category-order
 *   - Superadmin (cualquier tienda): /api/superadmin/stores/[slug]/category-order
 *   - Storefront /marketplace/[slug]: lee con `getCategoryOrder(slug)` server-side
 *     y reordena las categorías antes de pasarlas a `<StoreCategories />`.
 */

const STORE_PATH = join(process.cwd(), "lib", "data", "store-category-orders.json");

type Orders = Record<string, string[]>;

async function readOrders(): Promise<Orders> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Orders = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
          out[k] = v as string[];
        }
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

async function writeOrders(o: Orders): Promise<void> {
  await writeFile(STORE_PATH, JSON.stringify(o, null, 2), "utf8");
}

/** Devuelve el orden persistido para una tienda, o `[]` si no existe. */
export async function getCategoryOrder(storeSlug: string): Promise<string[]> {
  const o = await readOrders();
  return o[storeSlug] ?? [];
}

/** Persiste el orden completo (array de category ids). */
export async function setCategoryOrder(
  storeSlug: string,
  order: string[],
): Promise<void> {
  const o = await readOrders();
  // Dedupe preservando primer occurrence.
  const seen = new Set<string>();
  const clean = order.filter((id) => {
    if (typeof id !== "string" || !id.trim()) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (clean.length === 0) {
    delete o[storeSlug];
  } else {
    o[storeSlug] = clean;
  }
  await writeOrders(o);
}

/**
 * Reordena un array de items que tienen `id` o `slug` según el orden persistido.
 * Items que no estén en `order` quedan al final preservando su orden original.
 */
export function applyCategoryOrder<T extends { id?: string; slug?: string }>(
  items: T[],
  order: string[],
): T[] {
  if (order.length === 0) return items;
  const idxMap = new Map<string, number>();
  order.forEach((id, i) => idxMap.set(id, i));
  const get = (it: T) => it.id ?? it.slug ?? "";
  const ranked = items.map((it, originalIdx) => ({
    item: it,
    rank: idxMap.has(get(it)) ? idxMap.get(get(it))! : Number.MAX_SAFE_INTEGER,
    originalIdx,
  }));
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.originalIdx - b.originalIdx;
  });
  return ranked.map((r) => r.item);
}
