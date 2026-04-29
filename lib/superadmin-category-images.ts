import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Imágenes estandarizadas de categorías globales (gestionadas por superadmin).
 *
 * Storage: lib/data/superadmin-category-images.json
 *
 * Shape:
 *   {
 *     "Pollo": "https://.../pollo.png",
 *     "Bebidas": "https://.../bebidas.png",
 *     ...
 *   }
 *
 * Uso:
 *   - Superadmin: gestiona via /api/superadmin/marketplace/category-images
 *   - Storefront: `getCategoryImages(slug)` merge tienda + global
 *
 * Prioridad en el storefront:
 *   1. Imagen subida por la tienda (lib/store-category-order.ts)
 *   2. Imagen estandarizada global (este archivo)
 *   3. Sin imagen → modo texto-only
 */

const STORE_PATH = join(
  process.cwd(),
  "lib",
  "data",
  "superadmin-category-images.json",
);

type GlobalImages = Record<string, string>;

async function read(): Promise<GlobalImages> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: GlobalImages = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v.length > 0) {
          out[k] = v;
        }
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

async function write(images: GlobalImages): Promise<void> {
  await writeFile(STORE_PATH, JSON.stringify(images, null, 2), "utf8");
}

/** Devuelve TODAS las imágenes globales (defaults para todas las tiendas). */
export async function getGlobalCategoryImages(): Promise<GlobalImages> {
  return read();
}

/**
 * Persiste el set completo de imágenes globales.
 * Pasa `null` o "" en una key para borrarla.
 */
export async function setGlobalCategoryImages(
  images: Record<string, string | null | undefined>,
): Promise<void> {
  const current = await read();
  for (const [k, v] of Object.entries(images)) {
    if (!v || v.length === 0) {
      delete current[k];
    } else {
      current[k] = v;
    }
  }
  await write(current);
}

/**
 * Helper unificado: combina imágenes per-store con defaults globales.
 *
 * Prioridad:
 *   1. Si la tienda subió imagen para esa categoría → usar la tienda.
 *   2. Sino, si hay default global → usar el default.
 *   3. Sino, no incluir la key en el resultado (UI rendea modo texto).
 *
 * @param storeImages mapa de imágenes per-store (de lib/store-category-order)
 * @returns mapa final categoryName → URL imagen
 */
export async function resolveCategoryImages(
  storeImages: Record<string, string>,
): Promise<Record<string, string>> {
  const global = await read();
  const out: Record<string, string> = { ...global };
  // Per-store sobreescribe global
  for (const [k, v] of Object.entries(storeImages)) {
    if (v && v.length > 0) out[k] = v;
  }
  return out;
}
