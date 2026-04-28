import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Persistencia de orden de productos POR categoría POR tienda.
 * Storage: lib/data/store-product-orders.json
 *
 * Shape:
 *   {
 *     [storeSlug]: {
 *       [categoryName]: string[]   // array ordenado de product IDs
 *     }
 *   }
 *
 * Uso:
 *   - Admin del negocio: /api/admin/marketplace/product-order
 *   - Storefront /marketplace/[slug]: lee server-side y reordena los productos
 *     dentro de cada categoría antes del render.
 *
 * Productos no listados en la persistencia quedan al final preservando el
 * orden original (price asc / featured / etc).
 */

const STORE_PATH = join(process.cwd(), "lib", "data", "store-product-orders.json");

type StoreOrders = Record<string, Record<string, string[]>>;

async function readOrders(): Promise<StoreOrders> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: StoreOrders = {};
      for (const [slug, byCat] of Object.entries(parsed as Record<string, unknown>)) {
        if (byCat && typeof byCat === "object" && !Array.isArray(byCat)) {
          const cats: Record<string, string[]> = {};
          for (const [cat, ids] of Object.entries(byCat as Record<string, unknown>)) {
            if (Array.isArray(ids) && ids.every((x) => typeof x === "string")) {
              cats[cat] = ids as string[];
            }
          }
          out[slug] = cats;
        }
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

async function writeOrders(o: StoreOrders): Promise<void> {
  await writeFile(STORE_PATH, JSON.stringify(o, null, 2), "utf8");
}

/** Devuelve el mapa { categoryName → string[] productIds } de la tienda. */
export async function getProductOrder(storeSlug: string): Promise<Record<string, string[]>> {
  const o = await readOrders();
  return o[storeSlug] ?? {};
}

/** Devuelve el orden de productos para una categoría específica. */
export async function getProductOrderForCategory(
  storeSlug: string,
  categoryName: string,
): Promise<string[]> {
  const map = await getProductOrder(storeSlug);
  return map[categoryName] ?? [];
}

/** Persiste el mapa completo { categoryName → productIds } de la tienda. */
export async function setProductOrder(
  storeSlug: string,
  byCategory: Record<string, string[]>,
): Promise<void> {
  const o = await readOrders();
  // Sanitiza: dedupe por categoría + filtra strings vacíos.
  const clean: Record<string, string[]> = {};
  for (const [cat, ids] of Object.entries(byCategory)) {
    if (typeof cat !== "string" || !cat.trim()) continue;
    if (!Array.isArray(ids)) continue;
    const seen = new Set<string>();
    const list: string[] = [];
    for (const id of ids) {
      if (typeof id !== "string" || !id.trim()) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      list.push(id);
    }
    if (list.length > 0) clean[cat] = list;
  }
  if (Object.keys(clean).length === 0) {
    delete o[storeSlug];
  } else {
    o[storeSlug] = clean;
  }
  await writeOrders(o);
}

/**
 * Reordena un array de productos según el orden persistido para esa categoría.
 * Productos no listados quedan al final, respetando su orden original.
 */
export function applyProductOrder<T extends { id: string }>(
  products: T[],
  orderedIds: string[],
): T[] {
  if (!orderedIds || orderedIds.length === 0) return products;
  const idxMap = new Map<string, number>();
  orderedIds.forEach((id, i) => idxMap.set(id, i));
  return [...products].sort((a, b) => {
    const ra = idxMap.has(a.id) ? idxMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const rb = idxMap.has(b.id) ? idxMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}
