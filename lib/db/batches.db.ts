import "server-only";
import { prisma } from "@/lib/prisma";
import type { Batch as PBatch } from "@/lib/generated/prisma/client";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbBatch = {
  id: string;
  tenantId: string;
  lote: string;
  productName: string;
  productId?: number;
  productCategory: string;
  quantity: number;
  unit: string;
  supplierId?: string;
  supplierName: string;
  warehouseId?: string;
  entryDate: string;
  expiryDate: string;
  costUnit: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // Relaciones opcionales (incluidas cuando se pide include)
  product?: { id: number; name: string } | null;
};

export type DbBatchFilters = {
  search?: string;
  productId?: number;
  warehouseId?: string;
  /** "active" = quantity > 0 y no vencido | "expired" = vencido con stock | "expiring" = próximos N días | "empty" = quantity = 0 */
  status?: "active" | "expired" | "expiring" | "empty";
  /** Días para considerar "próximo a vencer" cuando status = "expiring". Default: 7 */
  expiringDays?: number;
  page?: number;
  limit?: number;
  /** Cursor ID for cursor-based pagination (takes precedence over page when provided) */
  cursor?: string;
};

export type DbBatchPage = {
  data: DbBatch[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Cursor for the next page (present only with cursor-based pagination) */
  nextCursor?: string;
};

export type DbBatchStats = {
  totalBatches: number;
  activeBatches: number;
  expiredWithStock: number;
  expiringWithin7Days: number;
  expiringWithin30Days: number;
  emptyBatches: number;
  totalUnits: number;
};

export type DbBatchCreateInput = {
  lote: string;
  productName: string;
  productId?: number;
  productCategory?: string;
  quantity: number;
  unit?: string;
  supplierId?: string;
  supplierName?: string;
  warehouseId?: string;
  entryDate: string | Date;
  expiryDate: string | Date;
  costUnit?: number;
  notes?: string;
};

export type DbBatchUpdateInput = Partial<DbBatchCreateInput>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

// ── Mapper ────────────────────────────────────────────────────────────────────

type PBatchWithProduct = PBatch & {
  product?: { id: number; name: string } | null;
};

function mapBatch(b: PBatchWithProduct): DbBatch {
  return {
    id: b.id,
    tenantId: b.tenantId,
    lote: b.lote,
    productName: b.productName,
    ...(b.productId != null && { productId: b.productId }),
    productCategory: b.productCategory,
    quantity: b.quantity,
    unit: b.unit,
    ...(b.supplierId != null && { supplierId: b.supplierId }),
    supplierName: b.supplierName,
    ...(b.warehouseId != null && { warehouseId: b.warehouseId }),
    entryDate: toDateOnly(b.entryDate),
    expiryDate: toDateOnly(b.expiryDate),
    // TD-018: costUnit es Decimal
    costUnit: toNumOrZero(b.costUnit),
    notes: b.notes,
    createdAt: toISO(b.createdAt),
    updatedAt: toISO(b.updatedAt),
    ...(b.product !== undefined && { product: b.product }),
  };
}

/**
 * Propagar Product.expiresAt al vencimiento más próximo con stock activo.
 * Solo aplica si el lote tiene productId vinculado.
 * Siempre fire-and-forget: propagateExpiresAt(id).catch(() => {})
 */
export async function propagateExpiresAt(productId: number | null | undefined): Promise<void> {
  if (!productId) return;
  const nearest = await prisma.batch.findFirst({
    where: { productId, quantity: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
    select: { expiryDate: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: { expiresAt: nearest?.expiryDate ?? null },
  });
}

// ── BatchesDB ─────────────────────────────────────────────────────────────────

export const BatchesDB = {
  /**
   * Listado paginado con filtros opcionales.
   * Ordenado por expiryDate ASC (FEFO natural).
   */
  async getAll(tenantId: string, filters: DbBatchFilters = {}): Promise<DbBatchPage> {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200);
    const now = new Date();

    // Construir where clause
    const where: Record<string, unknown> = { tenantId };

    if (filters.productId) {
      where.productId = filters.productId;
    }
    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }
    if (filters.search) {
      where.OR = [
        { lote: { contains: filters.search, mode: "insensitive" } },
        { productName: { contains: filters.search, mode: "insensitive" } },
        { supplierName: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters.status === "active") {
      where.quantity = { gt: 0 };
      where.expiryDate = { gte: now };
    } else if (filters.status === "expired") {
      where.expiryDate = { lt: now };
      where.quantity = { gt: 0 };
    } else if (filters.status === "expiring") {
      const days = filters.expiringDays ?? 7;
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() + days);
      where.expiryDate = { gte: now, lte: cutoff };
      where.quantity = { gt: 0 };
    } else if (filters.status === "empty") {
      where.quantity = { lte: 0 };
    }

    // Cursor-based pagination when cursor is provided; offset otherwise (backward compat)
    const useCursor = !!filters.cursor;
    const skip = useCursor ? 1 : (page - 1) * limit;

    const [rows, total] = await prisma.$transaction([
      prisma.batch.findMany({
        where,
        orderBy: { expiryDate: "asc" },
        take: useCursor ? limit + 1 : limit,
        ...(useCursor
          ? { skip: 1, cursor: { id: filters.cursor } }
          : { skip }),
        include: { product: { select: { id: true, name: true } } },
      }),
      prisma.batch.count({ where }),
    ]);

    if (useCursor) {
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;
      return {
        data: items.map(mapBatch),
        total,
        page: 0, // Not meaningful for cursor pagination
        limit,
        totalPages: Math.ceil(total / limit),
        ...(nextCursor && { nextCursor }),
      };
    }

    return {
      data: rows.map(mapBatch),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /** Obtener lote por ID, con validación de tenantId. */
  async getById(tenantId: string, id: string): Promise<DbBatch | null> {
    const row = await prisma.batch.findFirst({
      where: { id, tenantId },
      include: { product: { select: { id: true, name: true } } },
    });
    return row ? mapBatch(row) : null;
  },

  /**
   * Lotes activos de un producto específico, ordenados FEFO.
   * Usado por decrementFEFO() y pantalla de producto.
   */
  async getByProduct(tenantId: string, productId: number, onlyWithStock = true): Promise<DbBatch[]> {
    const rows = await prisma.batch.findMany({
      where: {
        tenantId,
        productId,
        ...(onlyWithStock && { quantity: { gt: 0 } }),
      },
      orderBy: { expiryDate: "asc" },
      include: { product: { select: { id: true, name: true } } },
    });
    return rows.map(mapBatch);
  },

  /**
   * Lotes próximos a vencer dentro de N días (FEFO alertas).
   * Incluye solo lotes con stock disponible.
   */
  async getExpiring(tenantId: string, days = 7): Promise<DbBatch[]> {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + days);
    const rows = await prisma.batch.findMany({
      where: {
        tenantId,
        expiryDate: { gte: now, lte: cutoff },
        quantity: { gt: 0 },
      },
      orderBy: { expiryDate: "asc" },
      include: { product: { select: { id: true, name: true } } },
    });
    return rows.map(mapBatch);
  },

  /** Lotes vencidos que aún tienen stock (pérdida potencial). */
  async getExpiredWithStock(tenantId: string): Promise<DbBatch[]> {
    const rows = await prisma.batch.findMany({
      where: {
        tenantId,
        expiryDate: { lt: new Date() },
        quantity: { gt: 0 },
      },
      orderBy: { expiryDate: "asc" },
      include: { product: { select: { id: true, name: true } } },
    });
    return rows.map(mapBatch);
  },

  /** Crear nuevo lote. Propaga Product.expiresAt si hay productId. */
  async create(tenantId: string, input: DbBatchCreateInput): Promise<DbBatch> {
    const row = await prisma.batch.create({
      data: {
        tenantId,
        lote: input.lote,
        productName: input.productName,
        productId: input.productId ?? null,
        productCategory: input.productCategory ?? "Otros",
        quantity: input.quantity,
        unit: input.unit ?? "unidad",
        supplierId: input.supplierId ?? null,
        supplierName: input.supplierName ?? "",
        warehouseId: input.warehouseId ?? null,
        entryDate: toDate(input.entryDate),
        expiryDate: toDate(input.expiryDate),
        costUnit: input.costUnit ?? 0,
        notes: input.notes ?? "",
      },
      include: { product: { select: { id: true, name: true } } },
    });

    propagateExpiresAt(row.productId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return mapBatch(row);
  },

  /** Actualizar campos de un lote. Verifica tenantId antes de modificar. */
  async update(tenantId: string, id: string, input: DbBatchUpdateInput): Promise<DbBatch | null> {
    const existing = await prisma.batch.findFirst({ where: { id, tenantId } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.lote !== undefined) data.lote = input.lote;
    if (input.productName !== undefined) data.productName = input.productName;
    if (input.productId !== undefined) data.productId = input.productId;
    if (input.productCategory !== undefined) data.productCategory = input.productCategory;
    if (input.quantity !== undefined) data.quantity = input.quantity;
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.supplierId !== undefined) data.supplierId = input.supplierId;
    if (input.supplierName !== undefined) data.supplierName = input.supplierName;
    if (input.warehouseId !== undefined) data.warehouseId = input.warehouseId;
    if (input.entryDate !== undefined) data.entryDate = toDate(input.entryDate);
    if (input.expiryDate !== undefined) data.expiryDate = toDate(input.expiryDate);
    if (input.costUnit !== undefined) data.costUnit = input.costUnit;
    if (input.notes !== undefined) data.notes = input.notes;

    await prisma.batch.updateMany({ where: { id, tenantId }, data });
    const row = await prisma.batch.findFirst({
      where: { id, tenantId },
      include: { product: { select: { id: true, name: true } } },
    });

    // Propagar al producto anterior y al nuevo si cambió el productId
    propagateExpiresAt(existing.productId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    if (input.productId && input.productId !== existing.productId) {
      propagateExpiresAt(input.productId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }

    if (!row) return null;
    return mapBatch(row);
  },

  /**
   * Ajustar cantidad de un lote directamente (ajuste de inventario).
   * Para decrementos FEFO en ventas usar InventoryMovementsDB.decrementFEFO().
   */
  async updateStock(tenantId: string, id: string, newQuantity: number): Promise<DbBatch | null> {
    const existing = await prisma.batch.findFirst({ where: { id, tenantId } });
    if (!existing) return null;

    await prisma.batch.updateMany({
      where: { id, tenantId },
      data: { quantity: Math.max(0, newQuantity) },
    });
    const row = await prisma.batch.findFirst({
      where: { id, tenantId },
      include: { product: { select: { id: true, name: true } } },
    });

    propagateExpiresAt(existing.productId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    if (!row) return null;
    return mapBatch(row);
  },

  /**
   * Eliminar lote físicamente.
   * Propaga Product.expiresAt después de eliminar.
   */
  async delete(tenantId: string, id: string): Promise<boolean> {
    const existing = await prisma.batch.findFirst({ where: { id, tenantId } });
    if (!existing) return false;

    await prisma.batch.deleteMany({ where: { id, tenantId } });

    propagateExpiresAt(existing.productId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return true;
  },

  /**
   * Resumen estadístico de lotes del tenant.
   * Usado por el dashboard de inventario.
   */
  async getStats(tenantId: string): Promise<DbBatchStats> {
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);

    const [
      totalBatches,
      activeBatches,
      expiredWithStock,
      expiringWithin7Days,
      expiringWithin30Days,
      emptyBatches,
      aggregated,
    ] = await prisma.$transaction([
      prisma.batch.count({ where: { tenantId } }),
      prisma.batch.count({ where: { tenantId, quantity: { gt: 0 }, expiryDate: { gte: now } } }),
      prisma.batch.count({ where: { tenantId, expiryDate: { lt: now }, quantity: { gt: 0 } } }),
      prisma.batch.count({ where: { tenantId, expiryDate: { gte: now, lte: in7Days }, quantity: { gt: 0 } } }),
      prisma.batch.count({ where: { tenantId, expiryDate: { gte: now, lte: in30Days }, quantity: { gt: 0 } } }),
      prisma.batch.count({ where: { tenantId, quantity: { lte: 0 } } }),
      prisma.batch.aggregate({ where: { tenantId, quantity: { gt: 0 } }, _sum: { quantity: true } }),
    ]);

    return {
      totalBatches,
      activeBatches,
      expiredWithStock,
      expiringWithin7Days,
      expiringWithin30Days,
      emptyBatches,
      totalUnits: aggregated._sum.quantity ?? 0,
    };
  },

  /** Contar lotes activos (quantity > 0) — helper ligero para widgets. */
  async countActive(tenantId: string): Promise<number> {
    return prisma.batch.count({ where: { tenantId, quantity: { gt: 0 } } });
  },
};
