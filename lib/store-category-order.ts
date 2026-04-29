import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Persistencia simple de orden e imágenes de categorías por tienda.
 * Storage: lib/data/store-category-orders.json (mismo patrón que
 * marketplace-categories.json — permitir editar sin migración de schema).
 *
 * Shape (legacy + nuevo):
 *   { [storeSlug]: string[] }                             // legacy (solo orden)
 *   { [storeSlug]: { order: string[], images: {} } }      // nuevo
 *
 * Uso:
 *   - Admin del negocio (su tienda): usa /api/admin/marketplace/category-order
 *   - Superadmin (cualquier tienda): /api/superadmin/stores/[slug]/category-order
 *   - Storefront /marketplace/[slug]: lee con `getCategoryOrder(slug)` server-side
 *     y reordena las categorías antes de pasarlas a `<StoreCategories />`.
 *   - Imágenes: lee con `getCategoryImages(slug)` que merge tienda + defaults
 *     globales del superadmin (lib/superadmin-category-images.ts).
 */

const STORE_PATH = join(process.cwd(), "lib", "data", "store-category-orders.json");

interface StoreEntry {
  order: string[];
  /** Mapa categoryId/name → URL de imagen subida por el dueño de la tienda. */
  images: Record<string, string>;
}

type Orders = Record<string, StoreEntry>;

async function readOrders(): Promise<Orders> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Orders = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        // Legacy: array de strings → migrar a { order, images: {} }
        if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
          out[k] = { order: v as string[], images: {} };
        } else if (
          v &&
          typeof v === "object" &&
          "order" in v &&
          Array.isArray((v as { order: unknown }).order)
        ) {
          const entry = v as { order: unknown; images?: unknown };
          out[k] = {
            order: (entry.order as unknown[]).filter((x) => typeof x === "string") as string[],
            images:
              entry.images && typeof entry.images === "object" && !Array.isArray(entry.images)
                ? Object.fromEntries(
                    Object.entries(entry.images as Record<string, unknown>).filter(
                      ([, v]) => typeof v === "string" && v.length > 0,
                    ) as [string, string][],
                  )
                : {},
          };
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
  return o[storeSlug]?.order ?? [];
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
  const existing = o[storeSlug] ?? { order: [], images: {} };
  if (clean.length === 0 && Object.keys(existing.images).length === 0) {
    delete o[storeSlug];
  } else {
    o[storeSlug] = { ...existing, order: clean };
  }
  await writeOrders(o);
}

/** Devuelve las imágenes per-store (sin merge con global). */
export async function getStoreCategoryImages(
  storeSlug: string,
): Promise<Record<string, string>> {
  const o = await readOrders();
  return o[storeSlug]?.images ?? {};
}

/** Persiste las imágenes per-store. Pasa `null` o "" en una key para borrarla. */
export async function setStoreCategoryImages(
  storeSlug: string,
  images: Record<string, string | null | undefined>,
): Promise<void> {
  const o = await readOrders();
  const existing = o[storeSlug] ?? { order: [], images: {} };
  const next = { ...existing.images };
  for (const [k, v] of Object.entries(images)) {
    if (!v || v.length === 0) {
      delete next[k];
    } else {
      next[k] = v;
    }
  }
  if (existing.order.length === 0 && Object.keys(next).length === 0) {
    delete o[storeSlug];
  } else {
    o[storeSlug] = { order: existing.order, images: next };
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
