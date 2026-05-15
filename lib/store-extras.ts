import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { logger } from "./logger";

/**
 * store-extras — campos opcionales del marketplace del tenant que NO viven
 * en `Store` (Prisma) para evitar migraciones de schema:
 *
 *   - subcategory:       string libre o id de subcategoría global
 *   - coverageZones:     ids/labels de zonas que cubre la tienda (multi-zona)
 *   - customCategories:  categorías propias del tenant (id, label, imageUrl,
 *                        subcategories[]) que solo se muestran en el
 *                        storefront de ESA tienda — no en filtros globales.
 *
 * Storage: lib/data/store-extras.json keyed por storeSlug. Mismo patrón que
 * store-construction.json. Archivo gitignored como runtime data.
 */

const STORE_PATH = join(process.cwd(), "lib", "data", "store-extras.json");

export interface CustomSubcategory {
  id: string;
  label: string;
  imageUrl: string | null;
}

export interface CustomCategory {
  id: string;
  label: string;
  imageUrl: string | null;
  subcategories: CustomSubcategory[];
}

export interface StoreExtras {
  subcategory: string | null;
  coverageZones: string[];
  customCategories: CustomCategory[];
  updatedAt: string;
}

const EMPTY_EXTRAS: StoreExtras = {
  subcategory: null,
  coverageZones: [],
  customCategories: [],
  updatedAt: new Date(0).toISOString(),
};

type Store = Record<string, StoreExtras>;

async function read(): Promise<Store> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Store;
    }
  } catch {
    /* archivo no existe — primera escritura lo crea */
  }
  return {};
}

async function write(data: Store): Promise<void> {
  await mkdir(dirname(STORE_PATH), { recursive: true }).catch((err) => {
    logger.warn("[store-extras] mkdir failed", { error: String(err) });
  });
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function getStoreExtras(slug: string): Promise<StoreExtras> {
  const all = await read();
  return all[slug] ?? { ...EMPTY_EXTRAS };
}

export async function setStoreExtras(
  slug: string,
  patch: Partial<Omit<StoreExtras, "updatedAt">>,
): Promise<StoreExtras> {
  const all = await read();
  const prev = all[slug] ?? { ...EMPTY_EXTRAS };
  const next: StoreExtras = {
    subcategory: patch.subcategory !== undefined ? patch.subcategory : prev.subcategory,
    coverageZones: Array.isArray(patch.coverageZones) ? patch.coverageZones : prev.coverageZones,
    customCategories: Array.isArray(patch.customCategories)
      ? patch.customCategories
      : prev.customCategories,
    updatedAt: new Date().toISOString(),
  };
  all[slug] = next;
  await write(all);
  return next;
}

/**
 * Lee extras para varios slugs (usado por /api/marketplace/stores para
 * exponer coverageZones al filtro de /tiendas).
 */
export async function getStoreExtrasMap(slugs: string[]): Promise<Map<string, StoreExtras>> {
  const all = await read();
  const out = new Map<string, StoreExtras>();
  for (const s of slugs) {
    if (all[s]) out.set(s, all[s]);
  }
  return out;
}
