import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  InventoryMovement as PInventoryMovement,
  Warehouse as PWarehouse,
} from "@/lib/generated/prisma/client";
import { DomainEvents } from "@/lib/domain-events";

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
  async getAll(tenantId: string, limit = 200): Promise<DbInventoryMovement[]> {
    const where: Record<string, unknown> = { tenantId };
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
   */
  async getPage(opts: {
    tenantId: string;
    cursor?: string;
    limit?: number;
    productId?: number;
    type?: string;
  }): Promise<{ movements: DbInventoryMovement[]; nextCursor: string | null; total: number }> {
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

  async record(data: { productId: number; type: string; lossType?: string; quantity: number; reference?: string; warehouseId?: string; notes?: string; createdBy?: string; tenantId: string }): Promise<DbInventoryMovement> {
    // Atomic: read current stock, compute new stock, update product, create movement
    const product = await prisma.product.findFirst({ where: { id: data.productId, tenantId: data.tenantId } });
    const prevStock = product?.stock ?? 0;
    const isIncrease = ["compra", "devolucion", "ajuste_positivo"].includes(data.type);
    const newStock = isIncrease ? prevStock + data.quantity : prevStock - data.quantity;
    const clampedNewStock = Math.max(0, newStock);
    // SECURITY 2026-05-06 (audit stock #1): updateMany con guard `stock=prevStock`
    // detecta lost-update si dos escritores leyeron el mismo prevStock. El
    // segundo update no afecta filas y el caller debe reintentar.
    const updateResult = await prisma.product.updateMany({
      where: { id: data.productId, tenantId: data.tenantId, stock: prevStock },
      data: { stock: clampedNewStock },
    });
    if (updateResult.count === 0) {
      throw new Error("STOCK_RACE_CONFLICT");
    }
    const row = await prisma.inventoryMovement.create({
      data: {
        productId: data.productId, type: data.type, lossType: data.lossType, quantity: data.quantity,
        previousStock: prevStock, newStock: clampedNewStock,
        reference: data.reference, notes: data.notes,
        tenantId: data.tenantId,
        ...(data.warehouseId ? { warehouseId: data.warehouseId } : {}),
        ...(data.createdBy ? { createdBy: data.createdBy } : {}),
      },
    });

    // Fire-and-forget: push notification when stock drops below minimum
    const lowStockMin = (product as unknown as { stockMin?: number | null })?.stockMin;
    if (
      !isIncrease &&
      lowStockMin != null &&
      prevStock > lowStockMin &&
      clampedNewStock <= lowStockMin &&
      product
    ) {
      // 1) Legacy push notification — scoped por tenantId (audit WhatsApp #14).
      import("@/lib/push-sender").then(({ broadcastPush }) =>
        broadcastPush({
          title: `⚠️ Stock bajo: ${product.name}`,
          body: clampedNewStock === 0
            ? `Se agotó "${product.name}". Reabastece cuanto antes.`
            : `Solo quedan ${clampedNewStock} unidad(es) de "${product.name}" (mínimo: ${lowStockMin}).`,
          url: "/admin?tab=inventario",
        }, data.tenantId)
      ).catch((err) => logger.error("[inventory.db] low-stock notification failed", { error: String(err), productId: data.productId }));

      // 2) Domain event
      if (data.tenantId) {
        DomainEvents.stockBajo(data.tenantId, {
          productId:     data.productId,
          productName:   product.name,
          currentStock:  clampedNewStock,
          stockMin:      lowStockMin,
          lastDeduction: data.quantity,
          reason:        (data.type === "venta" || data.type === "venta_online")
            ? "venta"
            : data.type === "merma"
              ? "merma"
              : data.type === "ajuste_negativo"
                ? "ajuste"
                : "transferencia",
        }).catch((err) => logger.error("[inventory.db] DomainEvents.stockBajo failed", { error: String(err), productId: data.productId }));
      }
    }

    return mapInventoryMovement(row);
  },

  /**
   * Decrement stock using FEFO (First Expired, First Out) batch selection.
   */
  async decrementFEFO(productId: number, quantity: number, tenantId: string, reference?: string, type: string = "venta_online"): Promise<void> {
    // 1. Decrement Product.stock globally
    await this.record({ productId, type, quantity, reference, notes: `FEFO: ${quantity} unidades`, tenantId });

    // 2. Decrement from batches (FEFO order). SECURITY 2026-05-06: filtrar
    // por tenantId para evitar consumir batches de otro tenant.
    await prisma.$transaction(async (tx) => {
      const batches = await tx.batch.findMany({
        where: { productId, tenantId, quantity: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
      });

      let remaining = quantity;
      const updates: Array<{ id: string; newQty: number }> = [];
      for (const batch of batches) {
        if (remaining <= 0) break;
        const toDeduct = Math.min(batch.quantity, remaining);
        updates.push({ id: batch.id, newQty: batch.quantity - toDeduct });
        remaining -= toDeduct;
      }

      if (updates.length > 0) {
        await Promise.all(
          updates.map((u) =>
            tx.batch.update({ where: { id: u.id }, data: { quantity: u.newQty } })
          )
        );
      }
    });

    // 3. Update Product.expiresAt
    await refreshProductExpiresAt(productId, tenantId);
  },

  async adjust(productId: number, newStock: number, tenantId: string, warehouseId?: string, notes?: string, createdBy?: string): Promise<DbInventoryMovement> {
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
    const prevStock = product?.stock ?? 0;
    const diff = newStock - prevStock;
    const type = diff >= 0 ? "ajuste_positivo" : "ajuste_negativo";
    await prisma.product.updateMany({ where: { id: productId, tenantId }, data: { stock: Math.max(0, newStock) } });
    const row = await prisma.inventoryMovement.create({
      data: {
        productId,
        type,
        quantity: Math.abs(diff),
        previousStock: prevStock,
        newStock: Math.max(0, newStock),
        notes,
        tenantId,
        ...(warehouseId ? { warehouseId } : {}),
        ...(createdBy ? { createdBy } : {}),
      },
    });
    return mapInventoryMovement(row);
  },
};

/**
 * Update Product.expiresAt to the nearest batch expiry date.
 */
async function refreshProductExpiresAt(productId: number, tenantId: string): Promise<void> {
  const nearestBatch = await prisma.batch.findFirst({
    where: { productId, quantity: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
    select: { expiryDate: true },
  });
  await prisma.product.updateMany({
    where: { id: productId, tenantId },
    data: { expiresAt: nearestBatch?.expiryDate ?? null },
  });
}

// ── Warehouses DB ─────────────────────────────────────────────────────────────

export const WarehousesDB = {
  async getAll(tenantId: string): Promise<DbWarehouse[]> {
    return (await prisma.warehouse.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } })).map(mapWarehouse);
  },
  async getById(tenantId: string, id: string): Promise<DbWarehouse | null> {
    const row = await prisma.warehouse.findFirst({ where: { id, tenantId } });
    return row ? mapWarehouse(row) : null;
  },
  async create(data: { name: string; code: string; type?: string; location?: string; manager?: string; capacity?: number; tenantId: string }): Promise<DbWarehouse> {
    const row = await prisma.warehouse.create({ data: { ...data, tenantId: data.tenantId } });
    return mapWarehouse(row);
  },
  async update(tenantId: string, id: string, data: Partial<{ name: string; location: string; manager: string; capacity: number; active: boolean }>): Promise<DbWarehouse | null> {
    const existing = await prisma.warehouse.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    await prisma.warehouse.updateMany({ where: { id, tenantId }, data });
    const row = await prisma.warehouse.findFirst({ where: { id, tenantId } });
    return row ? mapWarehouse(row) : null;
  },
  async delete(tenantId: string, id: string): Promise<boolean> {
    try {
      await prisma.warehouse.deleteMany({ where: { id, tenantId } });
      return true;
    } catch (e) {
      logger.error("WarehouseDB.delete failed", { err: e instanceof Error ? e.message : String(e), op: "WarehouseDB.delete", id, tenantId });
      return false;
    }
  },
  /** Ensure the default "Almacén Principal" exists; returns all warehouses. */
  async ensureDefault(tenantId: string): Promise<DbWarehouse[]> {
    const all = await this.getAll(tenantId);
    if (all.length === 0) {
      await prisma.warehouse.create({ data: { name: "Almacén Principal", code: "ALM-001", type: "principal", location: "Tienda San Martín", tenantId } });
      return this.getAll(tenantId);
    }
    return all;
  },
};

// ── Auto-Reorder Helper ───────────────────────────────────────────────────────

export const AutoReorderDB = {
  async getLowStockProducts(tenantId: string): Promise<{ id: number; name: string; stock: number; stockMin: number; stockMax: number; category: string; unit: string }[]> {
    const prods = await prisma.product.findMany({
      where: { tenantId, active: true, stock: { not: null }, stockMin: { not: null } },
      select: { id: true, name: true, stock: true, stockMin: true, stockMax: true, category: true, unit: true },
    });
    return prods
      .filter(p => p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin)
      .map(p => ({ id: p.id, name: p.name, stock: p.stock ?? 0, stockMin: p.stockMin ?? 0, stockMax: p.stockMax ?? (p.stockMin ?? 0) * 3, category: p.category, unit: p.unit }));
  },
};
