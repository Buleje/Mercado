import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma, type Batch as PBatch } from "@/lib/generated/prisma/client";
import { toNumOrZero } from "@/lib/decimal-utils";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { cantidadQueSaleDeLotes, limitesDeVence, type LoteDeRecepcion } from "@/lib/compras/lotes-recepcion";

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
    quantity: toNumOrZero(b.quantity),
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
export async function propagateExpiresAt(productId: number | null | undefined, tenantId?: string): Promise<void> {
  if (!productId) return;
  const nearest = await prisma.batch.findFirst({
    where: { productId, ...(tenantId ? { tenantId } : {}), quantity: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
    select: { expiryDate: true },
  });
  /**
   * Con `tenantId` esto pasa a ser `updateMany`: cargar un lote apuntando al
   * `productId` de otra empresa le escribía la fecha de vencimiento a SU
   * producto. `update({ where: { id } })` no tiene forma de acotar por tenant;
   * `updateMany` sí, y si no matchea no toca nada en vez de fallar.
   */
  if (tenantId) {
    await prisma.product.updateMany({
      where: { id: productId, tenantId },
      data: { expiresAt: nearest?.expiryDate ?? null },
    });
    return;
  }
  await prisma.product.update({
    where: { id: productId },
    data: { expiresAt: nearest?.expiryDate ?? null },
  });
}

/**
 * `getExpiring` guarda 60 s por tenant y días. Nadie lo soltaba al escribir:
 * un lote recién cargado (o recién recibido) tardaba hasta un minuto en
 * aparecer en la campana y en «Por vencer».
 */
function invalidarVencimientos(tenantId: string): void {
  invalidateByPrefix(`batches-expiring:${tenantId}:`);
}

/**
 * Id fijo por recepción + línea. Si la misma recepción se procesa dos veces
 * (la transacción se reintenta, o se vuelve a correr), el lote ya existe y
 * `skipDuplicates` no lo duplica.
 */
export function idDeLoteDeRecepcion(tenantId: string, receiptId: string, indice: number): string {
  const huella = createHash("sha256").update(`${tenantId}:${receiptId}:${indice}`).digest("hex");
  return `lrec_${huella.slice(0, 24)}`;
}

/** Lo que tocan los lotes de una recepción o de una venta: la tx del que llama. */
type TxLotes = Pick<Prisma.TransactionClient, "batch" | "product" | "$executeRaw">;

/** Un lote tocado por una venta: de cuál y cuánto salió. */
export type DescuentoDeLote = { batchId: string; qty: number; expiryDate: Date };

// ── BatchesDB ─────────────────────────────────────────────────────────────────

export const BatchesDB = {
  /**
   * Listado paginado con filtros opcionales.
   * Ordenado por expiryDate ASC (FEFO natural).
   */
  async getAll(tenantId: string, filters: DbBatchFilters = {}): Promise<DbBatchPage> {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200);
    // Por el día de Pucallpa, no por la hora: ver `limitesDeVence`.
    const { hoy, hasta } = limitesDeVence(filters.expiringDays ?? 7);

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
      where.expiryDate = { gte: hoy };
    } else if (filters.status === "expired") {
      where.expiryDate = { lt: hoy };
      where.quantity = { gt: 0 };
    } else if (filters.status === "expiring") {
      where.expiryDate = { gte: hoy, lte: hasta };
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
    // Cache 60s + dedup in-flight: 7 widgets del admin (bell, hub, dashboard…)
    // pegan a /api/batches/expiring por carga y la query tardaba ~1.8s. Los
    // vencimientos no cambian al segundo → 60s es seguro. Perf 2026-05-29.
    return getOrSet(`batches-expiring:${tenantId}:${days}`, 60, async () => {
      // Por el día de Pucallpa: el lote que vence hoy está «por vencer» todo
      // el día, no «vencido» desde las 19:00 de ayer (ver `limitesDeVence`).
      const { hoy, hasta } = limitesDeVence(days);
      const rows = await prisma.batch.findMany({
        where: {
          tenantId,
          expiryDate: { gte: hoy, lte: hasta },
          quantity: { gt: 0 },
        },
        orderBy: { expiryDate: "asc" },
        include: { product: { select: { id: true, name: true } } },
      });
      return rows.map(mapBatch);
    });
  },

  /** Lotes vencidos que aún tienen stock (pérdida potencial). */
  async getExpiredWithStock(tenantId: string): Promise<DbBatch[]> {
    const rows = await prisma.batch.findMany({
      where: {
        tenantId,
        expiryDate: { lt: limitesDeVence().hoy },
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

    propagateExpiresAt(row.productId, tenantId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    invalidarVencimientos(tenantId);

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
    propagateExpiresAt(existing.productId, tenantId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    if (input.productId && input.productId !== existing.productId) {
      propagateExpiresAt(input.productId, tenantId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }
    invalidarVencimientos(tenantId);

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
    invalidarVencimientos(tenantId);
    const row = await prisma.batch.findFirst({
      where: { id, tenantId },
      include: { product: { select: { id: true, name: true } } },
    });

    propagateExpiresAt(existing.productId, tenantId).catch(() => {
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
    invalidarVencimientos(tenantId);

    propagateExpiresAt(existing.productId, tenantId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return true;
  },

  /**
   * Lotes que nacen al recibir mercadería, en la MISMA transacción que suma el
   * stock: si la recepción se revierte, el lote también. Solo trae las líneas
   * que entraron a stock vendible (la merma no vence). Devuelve cuántos lotes
   * nuevos quedaron escritos (0 si ya existían: reintento de la misma recepción).
   */
  async crearDesdeRecepcionTx(
    tx: TxLotes,
    tenantId: string,
    receiptId: string,
    lotes: LoteDeRecepcion[],
  ): Promise<number> {
    if (lotes.length === 0) return 0;
    const entrada = new Date();
    const { count } = await tx.batch.createMany({
      data: lotes.map((l) => ({
        id: idDeLoteDeRecepcion(tenantId, receiptId, l.indice),
        tenantId,
        lote: l.lote,
        productName: l.productName,
        productId: l.productId,
        productCategory: l.productCategory,
        quantity: l.quantity,
        unit: l.unit,
        supplierId: l.supplierId,
        supplierName: l.supplierName,
        entryDate: entrada,
        // Medianoche UTC, igual que el alta manual (`new Date("YYYY-MM-DD")`).
        // Las listas comparan por el día de Pucallpa (`limitesDeVence`), así
        // que «vence hoy» sigue «por vencer» hasta la medianoche de Lima.
        expiryDate: new Date(`${l.expiryDate}T00:00:00.000Z`),
        costUnit: l.costUnit,
        notes: l.notes,
      })),
      skipDuplicates: true,
    });
    return count;
  },

  /**
   * `Product.expiresAt` = el vencimiento MÁS PRÓXIMO entre sus lotes con stock.
   * Lo lee el Resumen del inicio («vencen esta semana»). Va dentro de la tx de
   * la recepción para que el producto y su lote nunca se contradigan.
   *
   * UNA sola consulta para todos los productos: antes eran 2 por producto, en
   * serie, dentro de una tx que Prisma corta a los 5 s (revisión 09-10).
   */
  async propagarVenceTx(tx: TxLotes, tenantId: string, productIds: number[]): Promise<void> {
    const ids = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return;
    await tx.$executeRaw`
      UPDATE "Product" p
         SET "expiresAt" = (
               SELECT MIN(b."expiryDate") FROM "Batch" b
                WHERE b."productId" = p."id" AND b."tenantId" = ${tenantId} AND b."quantity" > 0
             )
       WHERE p."tenantId" = ${tenantId}
         AND p."id" IN (${Prisma.join(ids)})
    `;
  },

  /**
   * Lo que una venta saca de los lotes, en orden FEFO (el que vence primero).
   * Llamar DESPUÉS de bajar `Product.stock`: solo sale de los lotes lo que el
   * stock que queda ya no cubre (`cantidadQueSaleDeLotes`). Antes una venta
   * vaciaba el lote aunque hubiera stock sin lote de sobra en el estante.
   *
   * Cada lote baja con `decrement` y la condición en el WHERE: dos ventas a la
   * vez no se pisan (antes se escribía la cantidad absoluta leída).
   *
   * SIN CONECTAR (09-10): la venta sigue con la regla FEFO de siempre en
   * `lib/inventory/fefo-deduct.ts`. «Primero lo sin lote» deja un lote vencido con
   * unidades que ya se vendieron; decide el dueño antes de enchufarlo (y entonces
   * también en `InventoryDB` para los pedidos online, con candado por producto).
   */
  async descontarVentaTx(
    tx: TxLotes,
    tenantId: string,
    productId: number,
    vendido: number,
  ): Promise<{ lotes: DescuentoDeLote[]; desdeLotes: number }> {
    const lotes = await tx.batch.findMany({
      where: { tenantId, productId, quantity: { gt: 0 } },
      orderBy: { expiryDate: "asc" },
      select: { id: true, quantity: true, expiryDate: true },
    });
    if (lotes.length === 0) return { lotes: [], desdeLotes: 0 };
    const producto = await tx.product.findFirst({ where: { id: productId, tenantId }, select: { stock: true } });
    const sumaLotes = lotes.reduce((s, l) => s + Number(l.quantity), 0);
    let falta = cantidadQueSaleDeLotes({ vendido, sumaLotes, stockDespues: producto ? producto.stock : null });
    const tocados: DescuentoDeLote[] = [];
    for (const lote of lotes) {
      if (falta <= 0) break;
      const qty = Math.round(Math.min(Number(lote.quantity), falta) * 1000) / 1000;
      if (qty <= 0) continue;
      const { count } = await tx.batch.updateMany({
        where: { id: lote.id, tenantId, quantity: { gte: qty } },
        data: { quantity: { decrement: qty } },
      });
      if (count === 0) continue;
      tocados.push({ batchId: lote.id, qty, expiryDate: lote.expiryDate });
      falta = Math.round((falta - qty) * 1000) / 1000;
    }
    const desdeLotes = Math.round(tocados.reduce((s, t) => s + t.qty, 0) * 1000) / 1000;
    return { lotes: tocados, desdeLotes };
  },

  /** Después del commit de una recepción con lotes: la campana los ve ya. */
  invalidarVencimientos(tenantId: string): void {
    invalidarVencimientos(tenantId);
  },

  /**
   * Resumen estadístico de lotes del tenant.
   * Usado por el dashboard de inventario.
   */
  async getStats(tenantId: string): Promise<DbBatchStats> {
    // Por el día de Pucallpa, igual que las listas (ver `limitesDeVence`).
    const { hoy: now, hasta: in7Days } = limitesDeVence(7);
    const { hasta: in30Days } = limitesDeVence(30);

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
      totalUnits: toNumOrZero(aggregated._sum.quantity),
    };
  },

  /** Contar lotes activos (quantity > 0) — helper ligero para widgets. */
  async countActive(tenantId: string): Promise<number> {
    return prisma.batch.count({ where: { tenantId, quantity: { gt: 0 } } });
  },
};
