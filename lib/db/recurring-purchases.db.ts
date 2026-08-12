import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidateAdminCache } from "@/lib/admin-cache";
import type { RecurringPurchaseOrder as PRecurring, Prisma } from "@/lib/generated/prisma/client";

/**
 * RecurringPurchasesDB — los pedidos que se repiten solos (ADR-377).
 *
 * Antes vivían en `localStorage` bajo la clave `recurring-orders`: se perdían
 * al abrir el admin en otro equipo, no existían para nadie más del negocio, y
 * el "avisame 2 días antes" que se configuraba no lo leía ningún código.
 *
 * `tenantId` SIEMPRE primer parámetro.
 */

export type ItemRecurrente = {
  productId: number;
  name: string;
  quantity: number;
  unitCost: number;
  unit: string;
};

export type DbRecurringPurchase = {
  id: string;
  supplierId: string;
  supplierName: string;
  items: ItemRecurrente[];
  intervalDays: number;
  /** Próxima vez que toca pedir, en ISO. */
  nextDate: string;
  notifyDaysBefore: number;
  paymentMethod?: string;
  active: boolean;
  lastGeneratedAt?: string;
  lastOrderId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/** Número finito o 0: `itemsJson` es JSON libre, no un tipo garantizado. */
function numeroSeguro(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapItems(raw: unknown): ItemRecurrente[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((it) => {
    if (it == null || typeof it !== "object") return [];
    const o = it as Record<string, unknown>;
    const productId = Number(o.productId);
    if (!Number.isInteger(productId) || productId <= 0) return [];
    return [{
      productId,
      name: typeof o.name === "string" ? o.name : "",
      // El JSON viene de la base sin garantías de forma: números o basura.
      quantity: numeroSeguro(o.quantity),
      unitCost: numeroSeguro(o.unitCost),
      unit: typeof o.unit === "string" ? o.unit : "und",
    }];
  });
}

function mapRecurring(r: PRecurring): DbRecurringPurchase {
  return {
    id: r.id,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    items: mapItems(r.itemsJson),
    intervalDays: r.intervalDays,
    nextDate: r.nextDate.toISOString(),
    notifyDaysBefore: r.notifyDaysBefore,
    ...(r.paymentMethod != null && { paymentMethod: r.paymentMethod }),
    active: r.active,
    ...(r.lastGeneratedAt != null && { lastGeneratedAt: r.lastGeneratedAt.toISOString() }),
    ...(r.lastOrderId != null && { lastOrderId: r.lastOrderId }),
    ...(r.notes != null && { notes: r.notes }),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type CrearRecurrente = {
  supplierId: string;
  supplierName: string;
  items: ItemRecurrente[];
  intervalDays: number;
  nextDate: string;
  notifyDaysBefore: number;
  paymentMethod?: string;
  notes?: string;
};

export const RecurringPurchasesDB = {
  async getAll(tenantId: string): Promise<DbRecurringPurchase[]> {
    const rows = await prisma.recurringPurchaseOrder.findMany({
      where: { tenantId },
      orderBy: { nextDate: "asc" },
    });
    return rows.map(mapRecurring);
  },

  async getById(tenantId: string, id: string): Promise<DbRecurringPurchase | null> {
    const row = await prisma.recurringPurchaseOrder.findFirst({ where: { id, tenantId } });
    return row ? mapRecurring(row) : null;
  },

  /**
   * Los que hay que avisar hoy: activos cuya `nextDate` cae dentro de su
   * propio `notifyDaysBefore`. El filtro fino va en memoria porque el umbral
   * es por fila; la query acota a la ventana máxima para no traer el año.
   */
  async getPorAvisar(tenantId: string, ahora: Date): Promise<DbRecurringPurchase[]> {
    const VENTANA_MAX_DIAS = 30;
    const tope = new Date(ahora.getTime() + VENTANA_MAX_DIAS * 86400000);
    const rows = await prisma.recurringPurchaseOrder.findMany({
      where: { tenantId, active: true, nextDate: { lte: tope } },
      orderBy: { nextDate: "asc" },
    });
    return rows
      .map(mapRecurring)
      .filter((r) => {
        const faltan = Math.ceil((new Date(r.nextDate).getTime() - ahora.getTime()) / 86400000);
        return faltan <= r.notifyDaysBefore;
      });
  },

  async add(tenantId: string, data: CrearRecurrente): Promise<DbRecurringPurchase> {
    const row = await prisma.recurringPurchaseOrder.create({
      data: {
        tenantId,
        supplierId: data.supplierId,
        supplierName: data.supplierName,
        itemsJson: data.items as unknown as Prisma.InputJsonValue,
        intervalDays: data.intervalDays,
        nextDate: new Date(data.nextDate),
        notifyDaysBefore: data.notifyDaysBefore,
        paymentMethod: data.paymentMethod ?? null,
        notes: data.notes ?? null,
      },
    });
    invalidateAdminCache.afterPurchase(tenantId);
    return mapRecurring(row);
  },

  async update(
    tenantId: string,
    id: string,
    patch: Partial<Omit<DbRecurringPurchase, "id" | "createdAt" | "updatedAt">>,
  ): Promise<DbRecurringPurchase | null> {
    const existing = await prisma.recurringPurchaseOrder.findFirst({ where: { id, tenantId } });
    if (!existing) return null;

    const data: Prisma.RecurringPurchaseOrderUpdateInput = {};
    if (patch.items !== undefined) data.itemsJson = patch.items as unknown as Prisma.InputJsonValue;
    if (patch.intervalDays !== undefined) data.intervalDays = patch.intervalDays;
    if (patch.nextDate !== undefined) data.nextDate = new Date(patch.nextDate);
    if (patch.notifyDaysBefore !== undefined) data.notifyDaysBefore = patch.notifyDaysBefore;
    if (patch.paymentMethod !== undefined) data.paymentMethod = patch.paymentMethod || null;
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.notes !== undefined) data.notes = patch.notes || null;
    if (patch.lastGeneratedAt !== undefined) data.lastGeneratedAt = patch.lastGeneratedAt ? new Date(patch.lastGeneratedAt) : null;
    if (patch.lastOrderId !== undefined) data.lastOrderId = patch.lastOrderId || null;
    if (patch.supplierName !== undefined) data.supplierName = patch.supplierName;

    await prisma.recurringPurchaseOrder.updateMany({ where: { id, tenantId }, data: data as Prisma.RecurringPurchaseOrderUpdateManyMutationInput });
    const row = await prisma.recurringPurchaseOrder.findFirst({ where: { id, tenantId } });
    invalidateAdminCache.afterPurchase(tenantId);
    return row ? mapRecurring(row) : null;
  },

  /**
   * Corre la fecha al siguiente ciclo tras generar la orden. Si la recurrencia
   * quedó atrasada varios ciclos (nadie entró al admin en dos semanas), avanza
   * hasta pasar la fecha actual en vez de dejarla vencida para siempre.
   */
  async marcarGenerada(tenantId: string, id: string, orderId: string, ahora: Date): Promise<DbRecurringPurchase | null> {
    const actual = await prisma.recurringPurchaseOrder.findFirst({ where: { id, tenantId } });
    if (!actual) return null;

    const intervalo = Math.max(1, actual.intervalDays);
    let proxima = new Date(actual.nextDate.getTime() + intervalo * 86400000);
    while (proxima <= ahora) proxima = new Date(proxima.getTime() + intervalo * 86400000);

    await prisma.recurringPurchaseOrder.updateMany({
      where: { id, tenantId },
      data: { nextDate: proxima, lastGeneratedAt: ahora, lastOrderId: orderId },
    });
    invalidateAdminCache.afterPurchase(tenantId);
    const row = await prisma.recurringPurchaseOrder.findFirst({ where: { id, tenantId } });
    return row ? mapRecurring(row) : null;
  },

  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.recurringPurchaseOrder
      .deleteMany({ where: { id, tenantId } })
      .catch((err) => logger.error("[recurring-purchases.db] delete failed", { error: String(err), id, tenantId }));
    invalidateAdminCache.afterPurchase(tenantId);
  },
};
