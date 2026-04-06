import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  InventoryMovement as PInventoryMovement,
  Warehouse as PWarehouse,
} from "@/lib/generated/prisma/client";

// ── Local Types ───────────────────────────────────────────────────────────────

export type InventoryMovementType = "compra" | "venta" | "venta_online" | "devolucion" | "ajuste_positivo" | "ajuste_negativo" | "merma";

export type DbInventoryMovement = {
  id: string;
  productId: number;
  productName?: string;
  type: InventoryMovementType;
  lossType?: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference?: string;
  notes?: string;
  warehouseId?: string;
  createdBy?: string;
  createdAt: string;
};

export type DbWarehouse = {
  id: string;
  name: string;
  code: string;
  type: string;
  location: string;
  manager: string;
  capacity: number;
  active: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mappers ───────────────────────────────────────────────────────────────────

type PMovementWithProduct = PInventoryMovement & {
  product?: { id: number; name: string } | null;
};

function mapInventoryMovement(m: PMovementWithProduct): DbInventoryMovement {
  return {
    id: m.id, productId: m.productId,
    ...(m.product?.name != null && { productName: m.product.name }),
    type: m.type as InventoryMovementType,
    ...(m.lossType != null && { lossType: m.lossType }),
    quantity: m.quantity, previousStock: m.previousStock, newStock: m.newStock,
    ...(m.reference != null && { reference: m.reference }),
    ...(m.notes != null && { notes: m.notes }),
    ...((m as unknown as { warehouseId?: string | null }).warehouseId != null && { warehouseId: (m as unknown as { warehouseId: string }).warehouseId }),
    ...((m as unknown as { createdBy?: string | null }).createdBy != null && { createdBy: (m as unknown as { createdBy: string }).createdBy }),
    createdAt: toISO(m.createdAt),
  };
}

function mapWarehouse(w: PWarehouse): DbWarehouse {
  return {
    id: w.id,
    name: w.name,
    code: w.code,
    type: w.type,
    location: w.location,
    manager: w.manager,
    capacity: w.capacity,
    active: w.active,
    tenantId: w.tenantId,
    createdAt: toISO(w.createdAt),
    updatedAt: toISO(w.updatedAt),
  };
}

// ── Inventory Movements DB ────────────────────────────────────────────────────

export const InventoryMovementsDB = {
  async getAll(tenantId?: string, limit = 200): Promise<DbInventoryMovement[]> {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    return (await prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { product: { select: { id: true, name: true } } },
    })).map(mapInventoryMovement);
  },
  async getByProduct(productId: number): Promise<DbInventoryMovement[]> {
    return (await prisma.inventoryMovement.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      include: { product: { select: { id: true, name: true } } },
    })).map(mapInventoryMovement);
  },

  /**
   * Cursor-based paginated listing of inventory movements.
   * Returns up to `limit` rows plus the cursor for the next page.
   */
  async getPage(opts: {
    tenantId?: string;
    cursor?: string;
    limit?: number;
    productId?: number;
    type?: string;
  } = {}): Promise<{ movements: DbInventoryMovement[]; nextCursor: string | null; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);

    const where: Record<string, unknown> = {};
    if (opts.tenantId) where.tenantId = opts.tenantId;
    if (opts.productId) where.productId = opts.productId;
    if (opts.type) where.type = opts.type;

    const [rows, total] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
        include: { product: { select: { id: true, name: true } } },
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { movements: items.map(mapInventoryMovement), nextCursor, total };
  },
  async record(data: { productId: number; type: string; lossType?: string; quantity: number; reference?: string; warehouseId?: string; notes?: string; createdBy?: string }): Promise<DbInventoryMovement> {
    // Atomic: read current stock, compute new stock, update product, create movement
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    const prevStock = product?.stock ?? 0;
    const isIncrease = ["compra", "devolucion", "ajuste_positivo"].includes(data.type);
    const newStock = isIncrease ? prevStock + data.quantity : prevStock - data.quantity;
    const clampedNewStock = Math.max(0, newStock);
    await prisma.product.update({ where: { id: data.productId }, data: { stock: clampedNewStock } });
    const row = await prisma.inventoryMovement.create({
      data: {
        productId: data.productId, type: data.type, lossType: data.lossType, quantity: data.quantity,
        previousStock: prevStock, newStock: clampedNewStock,
        reference: data.reference, notes: data.notes,
        ...(data.warehouseId ? { warehouseId: data.warehouseId } : {}),
        ...(data.createdBy ? { createdBy: data.createdBy } : {}),
      },
    });

    // Fire-and-forget: push notification when stock drops below minimum
    const stockMin = (product as unknown as { stockMin?: number | null })?.stockMin;
    if (
      !isIncrease &&
      stockMin != null &&
      prevStock > stockMin &&
      clampedNewStock <= stockMin &&
      product
    ) {
      import("@/lib/push-sender").then(({ broadcastPush }) =>
        broadcastPush({
          title: `⚠️ Stock bajo: ${product.name}`,
          body: clampedNewStock === 0
            ? `Se agotó "${product.name}". Reabastece cuanto antes.`
            : `Solo quedan ${clampedNewStock} unidad(es) de "${product.name}" (mínimo: ${stockMin}).`,
          url: "/admin?tab=inventario",
        })
      ).catch(() => {});
    }

    return mapInventoryMovement(row);
  },
  /**
   * Decrement stock using FEFO (First Expired, First Out) batch selection.
   * Deducts from the earliest-expiring batch first, then moves to the next.
   * Also decrements Product.stock globally.
   */
  async decrementFEFO(productId: number, quantity: number, reference?: string, type: string = "venta_online"): Promise<void> {
    // 1. Decrement Product.stock globally
    await this.record({ productId, type, quantity, reference, notes: `FEFO: ${quantity} unidades` });

    // 2. Decrement from batches in FEFO order (earliest expiry first)
    let remaining = quantity;
    const batches = await prisma.batch.findMany({
      where: { productId, quantity: { gt: 0 } },
      orderBy: { expiryDate: "asc" },
    });

    for (const batch of batches) {
      if (remaining <= 0) break;
      const toDeduct = Math.min(batch.quantity, remaining);
      await prisma.batch.update({
        where: { id: batch.id },
        data: { quantity: batch.quantity - toDeduct },
      });
      remaining -= toDeduct;
    }

    // 3. Update Product.expiresAt to reflect the nearest batch expiry
    await refreshProductExpiresAt(productId);
  },

  async adjust(productId: number, newStock: number, warehouseId?: string, notes?: string, createdBy?: string): Promise<DbInventoryMovement> {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const prevStock = product?.stock ?? 0;
    const diff = newStock - prevStock;
    const type = diff >= 0 ? "ajuste_positivo" : "ajuste_negativo";
    await prisma.product.update({ where: { id: productId }, data: { stock: Math.max(0, newStock) } });
    const row = await prisma.inventoryMovement.create({
      data: { productId, type, quantity: Math.abs(diff), previousStock: prevStock, newStock: Math.max(0, newStock), notes,
        ...(warehouseId ? { warehouseId } : {}),
        ...(createdBy ? { createdBy } : {}) },
    });
    return mapInventoryMovement(row);
  },
};

/**
 * Update Product.expiresAt to the nearest batch expiry date (FEFO).
 * Called after any batch quantity change (sale, adjustment, purchase).
 */
async function refreshProductExpiresAt(productId: number): Promise<void> {
  const nearestBatch = await prisma.batch.findFirst({
    where: { productId, quantity: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
    select: { expiryDate: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: { expiresAt: nearestBatch?.expiryDate ?? null },
  });
}

// ── Warehouses DB ─────────────────────────────────────────────────────────────

export const WarehousesDB = {
  async getAll(tenantId = "main"): Promise<DbWarehouse[]> {
    return (await prisma.warehouse.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } })).map(mapWarehouse);
  },
  async getById(id: string): Promise<DbWarehouse | null> {
    const row = await prisma.warehouse.findUnique({ where: { id } });
    return row ? mapWarehouse(row) : null;
  },
  async create(data: { name: string; code: string; type?: string; location?: string; manager?: string; capacity?: number }): Promise<DbWarehouse> {
    const row = await prisma.warehouse.create({ data });
    return mapWarehouse(row);
  },
  async update(id: string, data: Partial<{ name: string; location: string; manager: string; capacity: number; active: boolean }>): Promise<DbWarehouse | null> {
    const row = await prisma.warehouse.update({ where: { id }, data });
    return mapWarehouse(row);
  },
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.warehouse.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },
  /** Ensure the default "Almacén Principal" exists; returns all warehouses. */
  async ensureDefault(): Promise<DbWarehouse[]> {
    const all = await this.getAll();
    if (all.length === 0) {
      await prisma.warehouse.create({ data: { name: "Almacén Principal", code: "ALM-001", type: "principal", location: "Tienda San Martín" } });
      return this.getAll();
    }
    return all;
  },
};

// ── Auto-Reorder Helper ───────────────────────────────────────────────────────

export const AutoReorderDB = {
  async getLowStockProducts(): Promise<{ id: number; name: string; stock: number; stockMin: number; stockMax: number; category: string; unit: string }[]> {
    const prods = await prisma.product.findMany({
      where: { active: true, stock: { not: null }, stockMin: { not: null } },
    });
    return prods
      .filter(p => p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin)
      .map(p => ({ id: p.id, name: p.name, stock: p.stock ?? 0, stockMin: p.stockMin ?? 0, stockMax: p.stockMax ?? (p.stockMin ?? 0) * 3, category: p.category, unit: p.unit }));
  },
};
