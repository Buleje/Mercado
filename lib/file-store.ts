/**
 * Simple JSON file-based key-value store for admin features
 * (goals, tasks, etc.) that don't need a full Prisma model.
 * Files are stored in local-data/<key>.json.
 */
import path from "path";
import fs from "fs/promises";

const DATA_DIR = path.join(process.cwd(), "local-data");

function filePath(key: string): string {
  // Safety: only allow alphanumeric keys with hyphens/underscores
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

/** Error de `readData` cuando la clave no existe todavía: el único caso que un llamador puede tratar como «vacío». */
export class ClaveInexistenteError extends Error {
  constructor(key: string) {
    super(`file-store: key "${key}" not found`);
    this.name = "ClaveInexistenteError";
  }
}

export function esClaveInexistente(err: unknown): err is ClaveInexistenteError {
  return err instanceof ClaveInexistenteError;
}

/**
 * Antes cualquier falla (JSON corrupto, permiso denegado) salía como «not
 * found», y metas y tareas la trataban como lista vacía: el POST siguiente
 * reescribía el archivo y se perdía todo (auditoría 2026-09-14). Ahora sólo un
 * archivo que no existe es `ClaveInexistenteError`; lo demás se relanza tal cual.
 */
export async function readData<T>(key: string): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath(key), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new ClaveInexistenteError(key);
    throw err;
  }
  return JSON.parse(raw) as T;
}

export async function writeData<T>(key: string, data: T): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath(key), JSON.stringify(data, null, 2), "utf-8");
}
