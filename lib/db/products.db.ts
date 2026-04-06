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
  async getAll(tenantId?: string): Promise<DbProduct[]> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (tenantId) where.tenantId = tenantId;
    const rows = await prisma.product.findMany({ where, orderBy: { id: "asc" } });
    return rows.map(mapProduct);
  },

  /**
   * Cursor-based paginated listing of products.
   * Returns up to `limit` products plus the cursor for the next page.
   */
  async getPage(opts: {
    tenantId?: string;
    cursor?: number;
    limit?: number;
    category?: string;
    search?: string;
    active?: boolean;
  } = {}): Promise<{ products: DbProduct[]; nextCursor: number | null; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

    const where: Record<string, unknown> = { deletedAt: null };
    if (opts.tenantId) where.tenantId = opts.tenantId;
    if (opts.category) where.category = opts.category;
    if (opts.active !== undefined) where.active = opts.active;
    if (opts.search) {
      where.OR = [
        { name: { contains: opts.search, mode: "insensitive" } },
        { barcode: { contains: opts.search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: { id: "asc" },
        take: limit + 1,
        ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      }),
      prisma.product.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { products: items.map(mapProduct), nextCursor, total };
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
      create: { id: product.id, ...d, ...(product.tenantId ? { tenantId: product.tenantId } : {}) },
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
  /** Bulk soft-delete: sets deletedAt on multiple products at once. */
  async bulkDelete(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await prisma.product.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count;
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
  async getAll(tenantId?: string): Promise<DbBundle[]> {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    return (await prisma.bundle.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapBundle);
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
