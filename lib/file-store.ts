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

export async function readData<T>(key: string): Promise<T> {
  try {
    const raw = await fs.readFile(filePath(key), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`file-store: key "${key}" not found`);
  }
}

export async function writeData<T>(key: string, data: T): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath(key), JSON.stringify(data, null, 2), "utf-8");
}
