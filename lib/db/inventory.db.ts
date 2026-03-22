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

function mapInventoryMovement(m: PInventoryMovement): DbInventoryMovement {
  return {
    id: m.id, productId: m.productId, type: m.type as InventoryMovementType,
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
  async getAll(limit = 200): Promise<DbInventoryMovement[]> {
    return (await prisma.inventoryMovement.findMany({ orderBy: { createdAt: "desc" }, take: limit })).map(mapInventoryMovement);
  },
  async getByProduct(productId: number): Promise<DbInventoryMovement[]> {
    return (await prisma.inventoryMovement.findMany({ where: { productId }, orderBy: { createdAt: "desc" } })).map(mapInventoryMovement);
  },
  async record(data: { productId: number; type: string; lossType?: string; quantity: number; reference?: string; warehouseId?: string; notes?: string; createdBy?: string }): Promise<DbInventoryMovement> {
    // Atomic: read current stock, compute new stock, update product, create movement
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    const prevStock = product?.stock ?? 0;
    const isIncrease = ["compra", "devolucion", "ajuste_positivo"].includes(data.type);
    const newStock = isIncrease ? prevStock + data.quantity : prevStock - data.quantity;
    await prisma.product.update({ where: { id: data.productId }, data: { stock: Math.max(0, newStock) } });
    const row = await prisma.inventoryMovement.create({
      data: {
        productId: data.productId, type: data.type, lossType: data.lossType, quantity: data.quantity,
        previousStock: prevStock, newStock: Math.max(0, newStock),
        reference: data.reference, notes: data.notes,
        ...(data.warehouseId ? { warehouseId: data.warehouseId } : {}),
        ...(data.createdBy ? { createdBy: data.createdBy } : {}),
      },
    });
    return mapInventoryMovement(row);
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
