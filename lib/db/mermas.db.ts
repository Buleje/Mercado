import "server-only";
import { prisma } from "@/lib/prisma";
import type { InventoryMovement as PInventoryMovement } from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MermaLossType = "damages" | "theft" | "expiry" | "obsolescence";

export type DbMerma = {
  id: string;
  productId: number;
  productName: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  lossType: MermaLossType;
  batchId?: string;
  notes?: string;
  warehouseId?: string;
  registeredBy?: string;
  tenantId: string;
  createdAt: string;
};

export type DbMermaFilters = {
  productId?: number;
  lossType?: MermaLossType;
  warehouseId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export type DbMermaPage = {
  data: DbMerma[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type DbMermaCreateInput = {
  productId: number;
  quantity: number;
  lossType: MermaLossType;
  batchId?: string;
  notes?: string;
  warehouseId?: string;
  registeredBy?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mapper ────────────────────────────────────────────────────────────────────

type PMovementWithProduct = PInventoryMovement & {
  product: { id: number; name: string };
};

function mapMerma(m: PMovementWithProduct): DbMerma {
  return {
    id: m.id,
    productId: m.productId,
    productName: m.product.name,
    quantity: m.quantity,
    previousStock: m.previousStock,
    newStock: m.newStock,
    lossType: (m.lossType ?? "damages") as MermaLossType,
    ...(m.reference != null && { batchId: m.reference }),
    ...(m.notes != null && { notes: m.notes }),
    ...((m as unknown as { warehouseId?: string | null }).warehouseId != null && {
      warehouseId: (m as unknown as { warehouseId: string }).warehouseId,
    }),
    ...((m as unknown as { createdBy?: string | null }).createdBy != null && {
      registeredBy: (m as unknown as { createdBy: string }).createdBy,
    }),
    tenantId: m.tenantId,
    createdAt: toISO(m.createdAt),
  };
}

// ── MermasDB ──────────────────────────────────────────────────────────────────

export const MermasDB = {
  /**
   * Listado paginado de mermas con filtros opcionales.
   * Una merma es un InventoryMovement con type = "merma".
   */
  async getAll(tenantId: string, filters: DbMermaFilters = {}): Promise<DbMermaPage> {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId, type: "merma" };

    if (filters.productId) where.productId = filters.productId;
    if (filters.lossType) where.lossType = filters.lossType;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    const [rows, total] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { product: { select: { id: true, name: true } } },
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return {
      data: (rows as PMovementWithProduct[]).map(mapMerma),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Registrar una merma: descuenta stock del producto y crea el movimiento.
   * Si se provee batchId, también descuenta del lote correspondiente.
   */
  async create(tenantId: string, input: DbMermaCreateInput): Promise<DbMerma> {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, tenantId },
    });
    if (!product) throw new Error("Producto no encontrado");

    const previousStock = product.stock ?? 0;
    const newStock = Math.max(0, previousStock - input.quantity);

    // Descontar del lote si se provee batchId
    if (input.batchId) {
      const batch = await prisma.batch.findFirst({
        where: { id: input.batchId, tenantId },
      });
      if (batch) {
        await prisma.batch.update({
          where: { id: batch.id },
          data: { quantity: Math.max(0, batch.quantity - input.quantity) },
        });
      }
    }

    // Actualizar stock del producto
    await prisma.product.update({
      where: { id: input.productId },
      data: { stock: newStock },
    });

    // Crear el movimiento tipo merma
    const row = await prisma.inventoryMovement.create({
      data: {
        productId: input.productId,
        tenantId,
        type: "merma",
        lossType: input.lossType,
        quantity: input.quantity,
        previousStock,
        newStock,
        reference: input.batchId ?? null,
        notes: input.notes ?? null,
        ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
        ...(input.registeredBy ? { createdBy: input.registeredBy } : {}),
      },
      include: { product: { select: { id: true, name: true } } },
    });

    return mapMerma(row as PMovementWithProduct);
  },
};
