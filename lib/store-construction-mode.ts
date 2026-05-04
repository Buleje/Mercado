import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { logger } from "@/lib/logger";

/**
 * store-construction-mode — flag por tienda "Tienda en construccion".
 *
 * Cuando el dueno habilita esta opcion en /admin?tab=marketplace → Mi Tienda
 * Personal, el card de su tienda en /tiendas muestra un overlay sobre la
 * portada con la leyenda "Tienda en construccion" para avisar a clientes
 * que el catalogo aun esta siendo armado y no aceptan pedidos completos.
 *
 * Storage: lib/data/store-construction.json (mismo patron que
 * store-category-orders.json — sin migracion de schema, JSON keyed por
 * storeSlug). Shape:
 *   { [storeSlug]: { enabled: boolean, message?: string, updatedAt: string } }
 */

const STORE_PATH = join(process.cwd(), "lib", "data", "store-construction.json");

export interface ConstructionEntry {
  enabled: boolean;
  message?: string;
  updatedAt: string;
}

type Store = Record<string, ConstructionEntry>;

async function read(): Promise<Store> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Store;
    }
  } catch {
    /* archivo no existe aun — first write lo crea */
  }
  return {};
}

async function write(data: Store): Promise<void> {
  // mkdir falla si ya existe (lo esperado) — la rama de fs subyacente lanza
  // EEXIST que con `recursive: true` ya esta swallowed; .catch() aqui solo
  // cubre permisos raros en algunos containers. Logueamos pero seguimos
  // intentando el writeFile (que dara un error mas util si tampoco puede).
  await mkdir(dirname(STORE_PATH), { recursive: true }).catch((err) => {
    logger.warn("[store-construction-mode] mkdir failed", { error: String(err) });
  });
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function getConstructionMode(slug: string): Promise<ConstructionEntry | null> {
  const all = await read();
  return all[slug] ?? null;
}

export async function setConstructionMode(
  slug: string,
  enabled: boolean,
  message?: string,
): Promise<ConstructionEntry> {
  const all = await read();
  const next: ConstructionEntry = {
    enabled,
    ...(message?.trim() ? { message: message.trim() } : {}),
    updatedAt: new Date().toISOString(),
  };
  all[slug] = next;
  await write(all);
  return next;
}

export async function listConstructionMode(): Promise<Record<string, ConstructionEntry>> {
  return read();
}
