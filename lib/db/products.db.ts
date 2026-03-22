import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  Product as PProduct,
  PriceHistory as PPriceHistory,
  Bundle as PBundle,
  BundleItem as PBundleItem,
} from "@/lib/generated/prisma/client";
import type { DbProduct } from "./misc.db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbPriceHistory = {
  id: number;
  productId: number;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
};

export type DbBundleItem = { id: number; productId: number; quantity: number };
export type DbBundle = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  active: boolean;
  createdAt: string;
  items: DbBundleItem[];
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapProduct(p: PProduct): DbProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    ...(p.costPrice != null && { costPrice: p.costPrice }),
    image: p.image,
    ...(p.description != null && { description: p.description }),
    unit: p.unit,
    ...(p.badge != null && { badge: p.badge }),
    ...(p.barcode != null && { barcode: p.barcode }),
    ...(p.stock != null && { stock: p.stock }),
    ...(p.stockMin != null && { stockMin: p.stockMin }),
    ...(p.stockMax != null && { stockMax: p.stockMax }),
    active: p.active,
  };
}

function mapPriceHistory(p: PPriceHistory): DbPriceHistory {
  return { id: p.id, productId: p.productId, oldPrice: p.oldPrice, newPrice: p.newPrice, changedAt: toISO(p.changedAt) };
}

function mapBundle(b: PBundle & { items: PBundleItem[] }): DbBundle {
  return {
    id: b.id, name: b.name, description: b.description, price: b.price,
    image: b.image, active: b.active, createdAt: toISO(b.createdAt),
    items: b.items.map(i => ({ id: i.id, productId: i.productId, quantity: i.quantity })),
  };
}

// ── Products ──────────────────────────────────────────────────────────────────

export const ProductsDB = {
  async getAll(): Promise<DbProduct[]> {
    const allRows = await prisma.product.findMany({ orderBy: { id: "asc" } });
    const rows = allRows.filter(r => (r as Record<string, unknown>).deletedAt == null);
    if (rows.length === 0) {
      const { products } = await import("@/data/products");
      for (const p of products) {
        await prisma.product.upsert({
          where: { id: p.id },
          create: { id: p.id, name: p.name, category: p.category, price: p.price, image: p.image, description: p.description ?? null, unit: p.unit, badge: p.badge, active: true },
          update: { image: p.image, description: p.description ?? null }, // keep image + description in sync
        });
      }
      const seeded = await prisma.product.findMany({ orderBy: { id: "asc" } });
      return seeded.filter(r => (r as Record<string, unknown>).deletedAt == null).map(mapProduct);
    }
    return rows.map(mapProduct);
  },
  async getById(id: number): Promise<DbProduct | null> {
    const p = await prisma.product.findUnique({ where: { id } });
    return p ? mapProduct(p) : null;
  },
  async upsert(product: DbProduct): Promise<DbProduct> {
    const d = {
      name: product.name, category: product.category, price: product.price,
      costPrice: product.costPrice, image: product.image,
      description: product.description ?? null,
      unit: product.unit,
      badge: product.badge, barcode: product.barcode, stock: product.stock,
      stockMin: product.stockMin, stockMax: product.stockMax, active: product.active,
    };
    const row = await prisma.product.upsert({
      where: { id: product.id },
      create: { id: product.id, ...d },
      update: d,
    });
    return mapProduct(row);
  },
  /** Soft-delete: sets deletedAt instead of physically removing the row. */
  async delete(id: number): Promise<void> {
    // Use raw SQL until `prisma generate` is re-run after migration 20260316
    await prisma.$executeRaw`UPDATE "Product" SET "deletedAt" = NOW() WHERE id = ${id}`.catch(() => {});
  },
  /** Hard-delete: permanently removes the row (admin use only). */
  async hardDelete(id: number): Promise<void> {
    await prisma.product.delete({ where: { id } }).catch(() => {});
  },
};

// ── Price History ─────────────────────────────────────────────────────────────

export const PriceHistoryDB = {
  async getByProduct(productId: number): Promise<DbPriceHistory[]> {
    return (await prisma.priceHistory.findMany({ where: { productId }, orderBy: { changedAt: "desc" } })).map(mapPriceHistory);
  },
  async getAll(limit = 100): Promise<DbPriceHistory[]> {
    return (await prisma.priceHistory.findMany({ orderBy: { changedAt: "desc" }, take: limit })).map(mapPriceHistory);
  },
  async record(productId: number, oldPrice: number, newPrice: number): Promise<DbPriceHistory> {
    if (oldPrice === newPrice) return { id: 0, productId, oldPrice, newPrice, changedAt: new Date().toISOString() };
    const row = await prisma.priceHistory.create({ data: { productId, oldPrice, newPrice } });
    return mapPriceHistory(row);
  },
};

// ── Bundles ───────────────────────────────────────────────────────────────────

export const BundlesDB = {
  async getAll(): Promise<DbBundle[]> {
    return (await prisma.bundle.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapBundle);
  },
  async getActive(): Promise<DbBundle[]> {
    return (await prisma.bundle.findMany({ where: { active: true }, include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapBundle);
  },
  async add(data: { name: string; description?: string; price: number; image?: string; items: { productId: number; quantity: number }[] }): Promise<DbBundle> {
    const row = await prisma.bundle.create({
      data: { name: data.name, description: data.description ?? "", price: data.price, image: data.image ?? "", items: { create: data.items } },
      include: { items: true },
    });
    return mapBundle(row);
  },
  async update(id: string, data: { name?: string; description?: string; price?: number; image?: string; active?: boolean }): Promise<DbBundle | null> {
    const row = await prisma.bundle.update({ where: { id }, data, include: { items: true } }).catch(() => null);
    return row ? mapBundle(row) : null;
  },
  async delete(id: string): Promise<void> {
    await prisma.bundle.delete({ where: { id } }).catch(() => {});
  },
};
