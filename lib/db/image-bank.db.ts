import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";

/**
 * Image Bank — banco global de imágenes mantenido por el superadmin.
 * Cada categoría tiene items (productos típicos del rubro). Los tenants
 * leen este banco para reusar imágenes al crear/editar productos.
 *
 * Storage: lib/data/image-bank.json (file system, MVP).
 * Migration a DB cuando crezca >100 items por categoría.
 */

const FILE = join(process.cwd(), "lib", "data", "image-bank.json");

export type ImageBankItem = {
  id: string;
  name: string;
  imageUrl: string;
};

export type ImageBankCategory = {
  id: string;
  name: string;
  description?: string;
  items: ImageBankItem[];
};

export type ImageBankShape = {
  categories: ImageBankCategory[];
};

const EMPTY: ImageBankShape = { categories: [] };

async function read(): Promise<ImageBankShape> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as ImageBankShape;
    return { categories: parsed.categories ?? [] };
  } catch (err) {
    logger.warn("[image-bank] read failed, returning empty", { err: String(err) });
    return EMPTY;
  }
}

async function write(data: ImageBankShape): Promise<void> {
  await writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const ImageBankDB = {
  async list(): Promise<ImageBankCategory[]> {
    const data = await read();
    return data.categories;
  },

  async getCategory(categoryId: string): Promise<ImageBankCategory | null> {
    const data = await read();
    return data.categories.find((c) => c.id === categoryId) ?? null;
  },

  async createCategory(input: { name: string; description?: string }): Promise<ImageBankCategory> {
    const data = await read();
    const id = slugify(input.name) || genId("cat");
    if (data.categories.some((c) => c.id === id)) {
      throw new Error(`Ya existe la categoría "${input.name}"`);
    }
    const cat: ImageBankCategory = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      items: [],
    };
    data.categories.push(cat);
    await write(data);
    return cat;
  },

  async updateCategory(categoryId: string, patch: { name?: string; description?: string }): Promise<ImageBankCategory> {
    const data = await read();
    const idx = data.categories.findIndex((c) => c.id === categoryId);
    if (idx === -1) throw new Error("Categoría no encontrada");
    const cat = data.categories[idx];
    if (patch.name !== undefined) cat.name = patch.name.trim();
    if (patch.description !== undefined) cat.description = patch.description.trim() || undefined;
    data.categories[idx] = cat;
    await write(data);
    return cat;
  },

  async deleteCategory(categoryId: string): Promise<void> {
    const data = await read();
    const before = data.categories.length;
    data.categories = data.categories.filter((c) => c.id !== categoryId);
    if (data.categories.length === before) throw new Error("Categoría no encontrada");
    await write(data);
  },

  async addItem(categoryId: string, input: { name: string; imageUrl: string }): Promise<ImageBankItem> {
    const data = await read();
    const cat = data.categories.find((c) => c.id === categoryId);
    if (!cat) throw new Error("Categoría no encontrada");
    const item: ImageBankItem = {
      id: genId(categoryId.slice(0, 3)),
      name: input.name.trim(),
      imageUrl: input.imageUrl,
    };
    cat.items.push(item);
    await write(data);
    return item;
  },

  async updateItem(categoryId: string, itemId: string, patch: { name?: string; imageUrl?: string }): Promise<ImageBankItem> {
    const data = await read();
    const cat = data.categories.find((c) => c.id === categoryId);
    if (!cat) throw new Error("Categoría no encontrada");
    const idx = cat.items.findIndex((it) => it.id === itemId);
    if (idx === -1) throw new Error("Item no encontrado");
    if (patch.name !== undefined) cat.items[idx].name = patch.name.trim();
    if (patch.imageUrl !== undefined) cat.items[idx].imageUrl = patch.imageUrl;
    await write(data);
    return cat.items[idx];
  },

  async deleteItem(categoryId: string, itemId: string): Promise<void> {
    const data = await read();
    const cat = data.categories.find((c) => c.id === categoryId);
    if (!cat) throw new Error("Categoría no encontrada");
    const before = cat.items.length;
    cat.items = cat.items.filter((it) => it.id !== itemId);
    if (cat.items.length === before) throw new Error("Item no encontrado");
    await write(data);
  },
};
